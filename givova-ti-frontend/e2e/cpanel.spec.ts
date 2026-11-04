import { expect, request as playwrightRequest, test } from "@playwright/test";
import { login, TECH_PASSWORD, TECH_USER } from "./support";

test.describe("cPanel package: routing, headers and PHP proxy", () => {
  test("direct navigation and refresh work for every route", async ({ request }) => {
    for (const path of ["/", "/chamado/", "/acompanhar/", "/acompanhar/?protocol=GV-000001", "/ti/", "/ti/?ticket=1", "/tutorial/"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain("text/html");
    }
    // Without the trailing slash the server adds it (query preserved; browsers keep the #fragment).
    for (const [path, expected] of [["/ti", "/ti/"], ["/chamado", "/chamado/"], ["/acompanhar?protocol=GV-1", "/acompanhar/?protocol=GV-1"]]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect([200, 301], path).toContain(response.status());
      if (response.status() === 301) {
        const location = new URL(response.headers().location, "https://placeholder.invalid");
        expect(location.pathname + location.search, path).toBe(expected);
      }
    }
  });

  test("legacy URLs redirect and unknown paths return a real 404", async ({ request }) => {
    const painel = await request.get("/painel?ticket=3", { maxRedirects: 0 });
    expect(painel.status()).toBe(302);
    expect(painel.headers().location).toMatch(/\/ti\/\?ticket=3$/);
    const legacy = await request.get("/chamado/GV-000123", { maxRedirects: 0 });
    expect(legacy.status()).toBe(302);
    expect(legacy.headers().location).toMatch(/\/acompanhar\/\?protocol=GV-000123$/);
    const missing = await request.get("/nao-existe", { maxRedirects: 0 });
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain("Página não encontrada");
  });

  test("HTTP is redirected to HTTPS", async ({ baseURL }) => {
    const host = new URL(baseURL!).host;
    const http = await playwrightRequest.newContext();
    const response = await http.get(`http://${host}/ti/`, { maxRedirects: 0 }).catch(() => null);
    test.skip(!response, "porta 80 não exposta neste ambiente");
    expect(response!.status()).toBe(301);
    expect(response!.headers().location).toBe(`https://${host}/ti/`);
    await http.dispose();
  });

  test("security headers and caching", async ({ request }) => {
    const page = await request.get("/");
    const headers = page.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'sha256-/);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("__CSP_SCRIPT_HASHES__");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cache-control"]).toContain("no-cache");
    const html = await page.text();
    const script = html.match(/\/_next\/static\/[^"]+\.js/)![0];
    expect((await request.get(script)).headers()["cache-control"]).toContain("immutable");
  });

  test("internal files are never served", async ({ request }) => {
    for (const path of ["/api/config.php", "/.htaccess", "/.user.ini", "/api/.htaccess", "/_next/.htaccess"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
    }
  });

  test("proxy allow-list, origin checks and input validation", async ({ request, baseURL }) => {
    expect((await request.get("/api/health")).status()).toBe(200);
    expect((await request.get("/api/catalog")).headers()["content-type"]).toContain("application/json");
    expect((await request.get("/api/admin")).status()).toBe(404);
    expect((await request.get("/api/tickets/1/../../etc/passwd")).status()).toBe(404);
    expect((await request.get("/api/tickets")).status()).toBe(401);
    expect((await request.delete("/api/tickets/1")).status()).toBe(405);
    const origin = new URL(baseURL!).origin;
    expect((await request.post("/api/auth/logout", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await request.post("/api/auth/logout")).status(), "writes without Origin are refused").toBe(403);
    expect((await request.post("/api/auth/logout", { headers: { Origin: origin } })).status()).toBe(200);
    expect((await request.get("/api/tracking/GV-1", { headers: { "X-Ticket-Key": "bad key; x=y" } })).status()).toBe(400);
    expect((await request.get("/api/tickets/1", { headers: { "X-Ticket-Key": "a".repeat(43) } })).status(), "key header only on tracking routes").toBe(400);
    expect((await request.get("/api/tickets?q=%0d%0aX")).status()).toBe(401);
    expect((await request.post("/api/auth/login", { headers: { Origin: origin, "Content-Type": "text/plain" }, data: "x" })).status()).toBe(415);
  });

  test("session cookie is Secure, HttpOnly, SameSite=Strict and host-only", async ({ request, baseURL }) => {
    test.skip(!TECH_PASSWORD, "credenciais E2E ausentes");
    const response = await request.post("/api/auth/login", {
      headers: { Origin: new URL(baseURL!).origin },
      data: { username: TECH_USER, password: TECH_PASSWORD },
    });
    expect(response.status()).toBe(200);
    const cookie = response.headers()["set-cookie"];
    expect(cookie).toMatch(/^givova_session=[A-Za-z0-9_-]{43}/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
    expect((await request.get("/api/auth/me")).status()).toBe(200);
    expect((await request.post("/api/auth/logout", { headers: { Origin: new URL(baseURL!).origin } })).status()).toBe(200);
    expect((await request.get("/api/auth/me")).status()).toBe(401);
  });

  test("technician login through the proxy", async ({ page }) => {
    test.skip(!TECH_PASSWORD, "credenciais E2E ausentes");
    await login(page);
  });
});
