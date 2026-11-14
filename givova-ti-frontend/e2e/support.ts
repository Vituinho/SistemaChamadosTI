import { expect, type Cookie, type Page, type TestInfo } from "@playwright/test";

export const TECH_USER = process.env.E2E_TECH_USER ?? "e2e-tecnico";
export const TECH_PASSWORD = process.env.E2E_TECH_PASSWORD ?? "";

export function target(testInfo: TestInfo): "nest" | "legacy" {
  return testInfo.project.metadata.target as "nest" | "legacy";
}

/** Collects page errors and CSP violations; call assertNoErrors() at the end of a test. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    const text = message.text();
    if (message.type() === "error" && /Content Security Policy|Refused to|Uncaught/i.test(text)) errors.push(`console: ${text}`);
  });
  return { assertNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}

/**
 * Session cookies per site, reused by tests whose subject is not the login itself.
 * The legacy FastAPI allows only 10 logins per IP every 5 minutes (successful ones
 * included) and every request arrives from the proxy IP, so logging in for every
 * test would trip it. Login itself is covered by dedicated tests (fresh: true).
 */
const sessions = new Map<string, Cookie[]>();

export async function login(page: Page, options: { fresh?: boolean } = {}) {
  if (!TECH_PASSWORD) throw new Error("Defina E2E_TECH_PASSWORD para os testes da TI.");
  const heading = page.getByRole("heading", { name: "Fila de chamados", exact: true });
  await page.goto("/ti/");
  const origin = new URL(page.url()).origin;
  const cached = sessions.get(origin);
  if (!options.fresh && cached) {
    await page.context().addCookies(cached);
    await page.goto("/ti/");
    const outcome = await Promise.race([
      heading.waitFor().then(() => "panel" as const, () => "timeout" as const),
      page.getByRole("heading", { name: "Entrar no painel" }).waitFor().then(() => "login" as const, () => "timeout" as const),
    ]);
    if (outcome === "panel") return;
    sessions.delete(origin); // revoked (e.g. by a logout test): log in again below
  }
  await page.getByLabel("Usuário").fill(TECH_USER);
  await page.getByLabel("Senha", { exact: true }).fill(TECH_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(heading).toBeVisible();
  sessions.set(origin, (await page.context().cookies(origin)).filter(cookie => cookie.name === "givova_session"));
}

export async function openTicket(page: Page, input: { name: string; title: string; category?: RegExp; location?: string; image?: Buffer; remember?: boolean }) {
  await page.goto("/chamado/");
  await page.getByRole("radio", { name: input.category ?? /^Internet/ }).check({ force: true });
  await page.getByLabel("Resumo do problema").fill(input.title);
  if (input.image) {
    await page.locator('input[type="file"]').setInputFiles({ name: "print.png", mimeType: "image/png", buffer: input.image });
    await expect(page.getByAltText("Pré-visualização da imagem anexada")).toBeVisible();
  }
  const name = page.getByLabel("Seu nome");
  if (!(await name.isVisible())) await page.getByRole("button", { name: "Alterar" }).click();
  await page.getByLabel("Seu nome").fill(input.name);
  await page.getByLabel("Estado").selectOption("PR");
  await page.getByRole("radio", { name: "Financeiro" }).check({ force: true });
  await page.getByLabel("Onde você está?").fill(input.location ?? "Sala E2E");
  const remember = page.getByRole("checkbox", { name: /Lembrar meus dados e chamados/ });
  if ((await remember.isChecked()) !== Boolean(input.remember)) await remember.click();
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page).toHaveURL(/\/acompanhar\/\?protocol=GV-\d+#[A-Za-z0-9_-]{43}$/, { timeout: 45_000 });
  await expect(page.getByText(/Chamado enviado! Seu protocolo é GV-\d+/)).toBeVisible();
  const protocol = new URL(page.url()).searchParams.get("protocol")!;
  return { protocol, url: page.url() };
}

/** 24×16 PNG (orange), generated with sharp */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVR4nGN4FcFDFcQwatCr0TB6NZqOIkazSAT5xQgAfJj1EFs8oi4AAAAASUVORK5CYII=", "base64");
