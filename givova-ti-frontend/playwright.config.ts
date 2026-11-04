import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the extracted cpanel.zip served by Apache/PHP (see e2e/cpanel).
 * Targets: "nest" (NestJS API) and "legacy" (current FastAPI API) — the same
 * static build must work with both.
 */
const targets = (process.env.E2E_TARGETS ?? "nest,legacy").split(",").map(t => t.trim()).filter(Boolean);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: targets.map(target => ({
    name: target,
    use: { ...devices["Desktop Chrome"], baseURL: `https://suporte-${target}.givova.test` },
    metadata: { target },
  })),
});
