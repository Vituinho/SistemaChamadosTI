#!/usr/bin/env node
/**
 * Prepares the local cPanel validation stack from the REAL package (default
 * dist/cpanel-staging.zip; override with E2E_ZIP):
 * - disposable test CA + certificates (site: *.givova.test, API: Railway-style
 *   *.up.railway.app names served by the test TLS front)
 * - one extraction per backend whose api/config.php allows exactly that test host,
 *   plus an untouched extraction ("unconfigured") to check the staging behaviour.
 *   The ZIP itself is never modified.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(HERE, "..", ".work");
const ZIP = process.env.E2E_ZIP ? resolve(process.env.E2E_ZIP) : resolve(HERE, "..", "..", "..", "dist", "cpanel-staging.zip");
export const API_HOSTS = { nest: "givova-e2e-nest.up.railway.app", legacy: "givova-e2e-legacy.up.railway.app" };
const CERTS = join(WORK, "certs");

function openssl(args) {
  execFileSync("openssl", args, { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
}

function certificates() {
  mkdirSync(CERTS, { recursive: true });
  const ca = [join(CERTS, "ca.key"), join(CERTS, "ca.crt")];
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=Givova E2E Test CA", "-keyout", ca[0], "-out", ca[1]]);
  for (const [name, hosts] of [["site", ["suporte-nest.givova.test", "suporte-legacy.givova.test", "suporte-unconfigured.givova.test"]], ["api", Object.values(API_HOSTS)]]) {
    const key = join(CERTS, `${name}.key`);
    const csr = join(CERTS, `${name}.csr`);
    const ext = join(CERTS, `${name}.ext`);
    writeFileSync(ext, `subjectAltName=${hosts.map(h => `DNS:${h}`).join(",")}\nextendedKeyUsage=serverAuth\n`);
    openssl(["req", "-newkey", "rsa:2048", "-nodes", "-subj", `/CN=${hosts[0]}`, "-keyout", key, "-out", csr]);
    openssl(["x509", "-req", "-in", csr, "-CA", ca[1], "-CAkey", ca[0], "-CAcreateserial", "-days", "2", "-extfile", ext, "-out", join(CERTS, `${name}.crt`)]);
  }
}

function extract(target, backendHost) {
  const dir = join(WORK, target);
  rmSync(dir, { recursive: true, force: true });
  const files = unzipSync(readFileSync(ZIP));
  for (const [name, data] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  if (!backendHost) return; // keep the package's own config.php
  const config = readFileSync(join(dir, "api", "config.php"), "utf8");
  const patched = config
    .replace(/'backend_url' => '[^']*'/, `'backend_url' => 'https://${backendHost}'`)
    .replace(/'allowed_hosts' => \[[^\]]*\]/, `'allowed_hosts' => ['${backendHost}']`);
  if (!patched.includes(`'backend_url' => 'https://${backendHost}'`) || !patched.includes(`'allowed_hosts' => ['${backendHost}']`)) {
    throw new Error("backend_url/allowed_hosts não encontrados em config.php");
  }
  writeFileSync(join(dir, "api", "config.php"), patched);
}

if (!existsSync(ZIP)) throw new Error(`Gere o pacote primeiro: ${ZIP}`);
// Keep the test CA between runs: containers load it at start-up. Use --new-certs to regenerate
// (then restart both the "tls" and "apache" containers).
if (process.argv.includes("--new-certs") || !existsSync(join(CERTS, "api.crt"))) {
  rmSync(CERTS, { recursive: true, force: true });
  certificates();
}
extract("site-nest", API_HOSTS.nest);
extract("site-legacy", API_HOSTS.legacy);
extract("site-unconfigured", null);
console.log(`Ambiente preparado em ${WORK}`);
