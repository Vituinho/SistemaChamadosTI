import { expect, test } from "@playwright/test";
import { login, openTicket, PNG, target, TECH_PASSWORD, watchErrors } from "./support";

test.describe("ticket lifecycle through the cPanel build", () => {
  test.skip(!TECH_PASSWORD, "credenciais E2E ausentes");

  test("employee opens → technician assumes → employee sees progress → technician resolves → employee sees the solution", async ({ browser }, testInfo) => {
    const v2 = target(testInfo) === "nest";
    const employeeContext = await browser.newContext();
    const technicianContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    const technician = await technicianContext.newPage();
    const employeeErrors = watchErrors(employee);
    const technicianErrors = watchErrors(technician);
    const title = `Sem internet E2E ${Date.now()}`;

    // Employee opens a ticket with a screenshot.
    const created = await openTicket(employee, { name: "Colaboradora E2E", title, image: PNG, remember: true });
    await expect(employee.getByRole("heading", { name: "A TI recebeu seu pedido" })).toBeVisible();
    await expect(employee.getByAltText("Imagem enviada com o chamado")).toBeVisible();

    // The tracking link survives a full reload (key stays in the fragment).
    await employee.reload();
    await expect(employee.getByText(title).first()).toBeVisible();

    // Technician logs in and finds the ticket.
    await login(technician);
    await technician.getByLabel("Buscar chamados").fill(created.protocol);
    const item = technician.getByRole("button", { name: new RegExp(title) });
    await expect(item).toBeVisible();
    await item.click();
    await expect(technician.getByRole("heading", { name: title })).toBeVisible();
    await expect(technician.getByRole("button", { name: "Ampliar imagem anexada" })).toBeVisible();

    // Assume (with confirmation).
    await technician.getByRole("button", { name: "Assumir chamado" }).click();
    await technician.getByRole("alertdialog").getByRole("button", { name: "Assumir chamado" }).click();
    await expect(technician.getByText("Chamado assumido")).toBeVisible();

    // Employee sees that IT is on the way (refresh button = same as the 15 s polling).
    await employee.getByRole("button", { name: "Atualizar" }).click();
    await expect(employee.getByRole("heading", { name: "A TI está indo até você!" })).toBeVisible();
    await expect(employee.getByText("Técnico responsável")).toBeVisible();

    // Message to the employee (API v2 only).
    if (v2) {
      await technician.getByRole("button", { name: "Mensagem ao colaborador" }).click();
      await technician.getByLabel("Mensagem ao colaborador").fill("Estou a caminho, chego em 5 minutos.");
      await technician.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(technician.getByText("Mensagem enviada ao colaborador")).toBeVisible();
      await employee.getByRole("button", { name: "Atualizar" }).click();
      await expect(employee.getByRole("heading", { name: "Mensagens da TI" })).toBeVisible();
      await expect(employee.getByText("Estou a caminho, chego em 5 minutos.").first()).toBeVisible();
    } else {
      await expect(technician.getByRole("button", { name: "Mensagem ao colaborador" })).toHaveCount(0);
    }

    // Priority change and resolution.
    await technician.getByLabel("Prioridade").selectOption("ALTA");
    await expect(technician.getByText("Chamado atualizado")).toBeVisible();
    await technician.getByRole("button", { name: "Resolver" }).click();
    await technician.getByLabel("Solução aplicada").fill("Cabo de rede substituído e conexão testada.");
    await technician.getByRole("button", { name: "Confirmar resolução" }).click();
    await expect(technician.getByText("Chamado resolvido")).toBeVisible();
    await expect(technician.getByText(/Atendimento encerrado/)).toBeVisible();

    // Employee sees the resolution and the history.
    await employee.getByRole("button", { name: "Atualizar" }).click();
    await expect(employee.getByRole("heading", { name: "Problema resolvido" })).toBeVisible();
    await expect(employee.getByText("Cabo de rede substituído e conexão testada.").first()).toBeVisible();
    await expect(employee.getByText(/prioridade Normal → Alta/)).toBeVisible();

    // Saved on this computer: the home page lists it.
    await employee.goto("/");
    await expect(employee.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    // Legacy link format (/chamado/GV-x#key) still opens the ticket.
    const key = new URL(created.url).hash;
    await employee.goto(`/chamado/${created.protocol}${key}`);
    await expect(employee).toHaveURL(new RegExp(`/acompanhar/\\?protocol=${created.protocol}#`));
    await expect(employee.getByRole("heading", { name: "Problema resolvido" })).toBeVisible();

    // A wrong key reveals nothing.
    await employee.goto(`/acompanhar/?protocol=${created.protocol}#${"x".repeat(43)}`);
    await expect(employee.getByText("Chamado não encontrado")).toBeVisible();

    // Logout ends the session.
    await technician.getByRole("button", { name: /Conta de/ }).click();
    await technician.getByRole("menuitem", { name: "Sair" }).click();
    await expect(technician.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
    await technician.reload();
    await expect(technician.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();

    employeeErrors.assertNoErrors();
    technicianErrors.assertNoErrors();
    await employeeContext.close();
    await technicianContext.close();
  });

  test("new tickets raise an alert in the open technician panel", async ({ browser }) => {
    const technicianContext = await browser.newContext();
    const technician = await technicianContext.newPage();
    await login(technician);
    await technician.waitForTimeout(1000);
    const employee = await (await browser.newContext()).newPage();
    const title = `Impressora E2E ${Date.now()}`;
    await openTicket(employee, { name: "Alerta E2E", title, category: /^Impressora/ });
    // Dashboard polling (15 s) detects the new ticket and shows the alert.
    const alert = technician.getByRole("complementary", { name: "Novo chamado" });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert.getByText(title)).toBeVisible();
    await alert.getByRole("button", { name: "Ver chamado" }).click();
    await expect(technician.getByRole("heading", { name: title })).toBeVisible();
    await technicianContext.close();
  });

  test("shared computers: by default nothing about the employee is stored", async ({ page }) => {
    const title = `Computador compartilhado ${Date.now()}`;
    await openTicket(page, { name: "Pessoa Compartilhada", title, location: "Recepção" });
    await expect(page.getByText(/nada foi salvo neste computador/)).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("givova.")))).toEqual([]);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Seus chamados neste computador" })).toHaveCount(0);
    await page.goto("/chamado/");
    await expect(page.getByLabel("Seu nome")).toHaveValue("");
  });

  test("opt-in memory can be wiped with \"Esquecer este computador\"", async ({ page }) => {
    const title = `Meu computador ${Date.now()}`;
    await openTicket(page, { name: "Pessoa Fixa", title, remember: true });
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await page.getByRole("button", { name: "Esquecer este computador" }).click();
    await expect(page.getByRole("heading", { name: "Seus chamados neste computador" })).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("givova.")))).toEqual([]);
    await page.goto("/chamado/");
    await expect(page.getByLabel("Seu nome")).toHaveValue("");
  });

  test("employee form validation and attachment rules", async ({ page }) => {
    await page.goto("/chamado/");
    await page.getByRole("button", { name: "Enviar chamado" }).click();
    await expect(page.getByText(/Faltam \d+ informações/)).toBeVisible();
    await page.getByRole("radio", { name: /^Sistema/ }).check({ force: true });
    await expect(page.getByRole("group", { name: "Qual sistema?" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await page.getByRole("button", { name: "Enviar chamado" }).click();
    await expect(page.getByText("Envie uma imagem PNG, JPG ou WEBP.").first()).toBeVisible();
  });
});
