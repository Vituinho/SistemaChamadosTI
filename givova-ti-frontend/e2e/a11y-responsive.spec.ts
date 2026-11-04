import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, openTicket, TECH_PASSWORD } from "./support";

async function audit(page: Page, label: string) {
  // @axe-core/playwright is typed against a newer Playwright Page; the runtime API used is identical.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = results.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map(v => `${label}: ${v.id} (${v.impact}) — ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

async function noHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} rola na horizontal`).toBeLessThanOrEqual(0);
}

test.describe("accessibility (WCAG 2.2 AA, axe) and responsive layout", () => {
  test("public pages", async ({ page }) => {
    for (const path of ["/", "/chamado/", "/acompanhar/", "/tutorial/", "/ti/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, path);
    }
    await page.goto("/chamado/");
    await page.getByRole("button", { name: "Enviar chamado" }).click();
    await expect(page.getByText(/Faltam \d+ informações/)).toBeVisible();
    await audit(page, "/chamado/ com erros");
  });

  test("tracking page and technician workspace", async ({ page }) => {
    test.skip(!TECH_PASSWORD, "credenciais E2E ausentes");
    await openTicket(page, { name: "A11y E2E", title: `Acessibilidade ${Date.now()}` });
    await audit(page, "/acompanhar (chamado)");
    await login(page);
    await page.getByRole("button", { name: /Acessibilidade/ }).first().click();
    await expect(page.getByRole("button", { name: "Assumir chamado" })).toBeVisible();
    await audit(page, "/ti (detalhe aberto)");
  });

  for (const viewport of [{ width: 375, height: 812, name: "celular" }, { width: 768, height: 1024, name: "tablet" }, { width: 1366, height: 768, name: "notebook" }]) {
    test(`no horizontal scrolling — ${viewport.name}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, baseURL });
      const page = await context.newPage();
      for (const path of ["/", "/chamado/", "/acompanhar/", "/tutorial/", "/ti/"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await noHorizontalOverflow(page, `${path} (${viewport.name})`);
      }
      if (TECH_PASSWORD) {
        await login(page);
        await noHorizontalOverflow(page, `/ti painel (${viewport.name})`);
      }
      await context.close();
    });
  }

  test("keyboard: skip link and visible focus", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
