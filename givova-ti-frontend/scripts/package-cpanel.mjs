#!/usr/bin/env node
/**
 * Builds the static cPanel package (extract into the document root).
 *
 *   node scripts/package-cpanel.mjs [--api-url https://<api-host>] [--no-verify] [--skip-build] [--out <dir>]
 *
 * Channels:
 * - production → dist/cpanel.zip: only with --api-url AND a successful live check of
 *   that API (GET /health = ok, GET /catalog api_version >= 2, valid TLS). The proxy
 *   config gets that exact host as the only allowed upstream.
 * - staging → dist/cpanel-staging.zip: no --api-url (proxy answers 503 "not
 *   configured"), or --api-url with --no-verify. Never deploy a staging package to
 *   production.
 *
 * Steps: CPANEL_EXPORT=1 next build → verify routes → merge deploy/cpanel →
 * compute CSP hashes of inline scripts → reject forbidden files and secrets →
 * write a deterministic ZIP → re-read it and verify CRC and contents.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { unzipSync, zipSync } from "fflate";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(FRONTEND, "..");
const DEPLOY = join(ROOT, "deploy", "cpanel");
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(ROOT, "dist");
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const API_HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Validates --api-url: https://<public dns name>, nothing else (same rules as api/upstream.php). */
function parseApiUrl(raw) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--api-url inválida: ${raw}`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)
      || !API_HOST.test(host) || /(^|\.)(localhost|internal|local|test|invalid|example)$/.test(host)) {
    throw new Error("--api-url deve ser https://<domínio público> sem porta, caminho, consulta ou credenciais.");
  }
  return { url: `https://${host}`, host };
}

/** The production channel requires the API to answer for real (no invented or unverified URLs). */
async function verifyApi(api) {
  const get = async path => {
    const response = await fetch(api.url + path, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "givova-ti-packager" } });
    if (!response.ok) throw new Error(`${path} respondeu HTTP ${response.status}`);
    return response.json();
  };
  const health = await get("/health");
  if (health.status !== "ok") throw new Error("/health não respondeu status ok (banco indisponível?)");
  const catalog = await get("/catalog");
  if (!(catalog.api_version >= 2)) throw new Error("/catalog não é da API NestJS (api_version >= 2).");
  log(`✓ API verificada: ${api.url} (health ok, api_version ${catalog.api_version})`);
}

function proxyConfig(api) {
  return `<?php
// Gerado por scripts/package-cpanel.mjs após verificar a API em ${new Date().toISOString().slice(0, 10)}.
// Somente endereços públicos: nunca coloque senhas, chaves ou a conexão do banco aqui.
return [
    'backend_url' => 'https://${api.host}',
    'allowed_hosts' => ['${api.host}'],
    'timeout' => 20,
];
`;
}

let api;
try {
  api = parseApiUrl(option("--api-url"));
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
const channel = api && !args.includes("--no-verify") ? "production" : "staging";
const zipName = channel === "production" ? "cpanel.zip" : "cpanel-staging.zip";
const target = join(outDir, zipName);

const REQUIRED_ROUTES = ["", "chamado", "acompanhar", "ti", "painel", "tutorial"];
const REQUIRED_FILES = [
  "index.html", "404.html", ".htaccess", ".user.ini", "api/index.php", "api/config.php", "api/.htaccess",
  "_next/.htaccess", "push-sw.js", "tutorial.mp4", "icons/icon-192.png", "build.json",
  ...REQUIRED_ROUTES.filter(Boolean).map(route => `${route}/index.html`),
];
const FORBIDDEN_NAME = /(^|\/)(node_modules|\.git|\.next|\.venv|src|tests?|e2e|coverage|backend|backend-nest)(\/|$)|(^|\/)\.env|\.(map|ts|tsx|py|pem|key|crt|sql|sqlite|db|log|bak|zip)$/i;
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /postgres(ql)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@/i,
  /VAPID_PRIVATE_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}/,
  /DATABASE_URL\s*[=:]/,
  /GIVOVA_PASSWORD|CREATE_USER_PASSWORD/,
  /(api[_-]?key|secret|token)\s*[=:]\s*["'][A-Za-z0-9_\-]{24,}["']/i,
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function build() {
  log("› next build (CPANEL_EXPORT=1)");
  // Run the Next.js CLI with this Node binary (no shell, no npm wrapper).
  const nextBin = createRequire(join(FRONTEND, "package.json")).resolve("next/dist/bin/next");
  execFileSync(process.execPath, [nextBin, "build"], { cwd: FRONTEND, stdio: "inherit", env: { ...process.env, CPANEL_EXPORT: "1", NEXT_TELEMETRY_DISABLED: "1" } });
}

function git(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}
const gitCommit = () => git(["rev-parse", "--short", "HEAD"], "desconhecido");
/** Commit date (not "now") keeps build.json identical for rebuilds of the same commit. */
const commitDate = () => git(["log", "-1", "--format=%cI"], new Date().toISOString());

/** sha256 hashes of every inline <script> (Next.js bootstrap/RSC payload) for the CSP. */
function inlineScriptHashes(files) {
  const hashes = new Set();
  for (const [name, data] of files) {
    if (!name.endsWith(".html")) continue;
    const html = Buffer.from(data).toString("utf8");
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const type = /\btype=["']?([^"'\s>]+)/i.exec(match[1])?.[1];
      if (type && !/javascript|module/i.test(type)) continue;
      hashes.add(`'sha256-${createHash("sha256").update(match[2], "utf8").digest("base64")}'`);
    }
  }
  return [...hashes].sort();
}

async function main() {
  if (channel === "production") await verifyApi(api);
  if (!args.includes("--skip-build")) build();
  const out = join(FRONTEND, "out");
  if (!existsSync(out)) throw new Error("Pasta out/ ausente. Rode sem --skip-build.");
  const required = JSON.parse(readFileSync(join(FRONTEND, ".next", "required-server-files.json"), "utf8")).config;
  if (required.output !== "export" || required.env?.NEXT_PUBLIC_API_URL !== "/api" || required.env?.NEXT_PUBLIC_POLLING_ONLY !== "1") {
    throw new Error("O último build não é o export cPanel (output=export, API=/api, polling).");
  }

  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  for (const file of walk(out)) files.set(relative(out, file).split(sep).join("/"), readFileSync(file));
  for (const file of walk(DEPLOY)) files.set(relative(DEPLOY, file).split(sep).join("/"), readFileSync(file));

  for (const route of REQUIRED_ROUTES) {
    if (!files.has(route ? `${route}/index.html` : "index.html")) throw new Error(`Rota estática ausente: /${route}`);
  }

  // Content-Security-Policy with hashes of the inline scripts of this exact build.
  const hashes = inlineScriptHashes(files);
  const htaccess = Buffer.from(files.get(".htaccess")).toString("utf8");
  if (!htaccess.includes("__CSP_SCRIPT_HASHES__")) throw new Error(".htaccess sem o marcador __CSP_SCRIPT_HASHES__");
  files.set(".htaccess", Buffer.from(htaccess.replace("__CSP_SCRIPT_HASHES__", hashes.join(" ")), "utf8"));

  if (api) files.set("api/config.php", Buffer.from(proxyConfig(api), "utf8"));
  const proxyTarget = /'backend_url' => '([^']*)'/.exec(Buffer.from(files.get("api/config.php")).toString("utf8"))?.[1] ?? "";
  if (channel === "production" && proxyTarget !== api.url) throw new Error("config.php não aponta para a API verificada.");
  if (channel === "staging" && !api && proxyTarget !== "") throw new Error("O config.php padrão do pacote de staging deve ter backend_url vazio.");
  files.set("build.json", Buffer.from(JSON.stringify({
    app: "givova-ti",
    channel,
    api_upstream: proxyTarget || null,
    api_verified: channel === "production",
    commit: gitCommit(),
    commit_date: commitDate(),
  }, null, 2) + "\n"));

  const problems = [];
  for (const [name, data] of files) {
    if (FORBIDDEN_NAME.test(name)) problems.push(`arquivo proibido: ${name}`);
    if (/\.(html|js|txt|json|css|php|ini|htaccess)$|^\.htaccess$|\/\.htaccess$/.test(name)) {
      const text = Buffer.from(data).toString("utf8");
      for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) problems.push(`possível segredo (${pattern}) em ${name}`);
      if (/localhost:8000/.test(text) && name.endsWith(".js")) problems.push(`URL de desenvolvimento em ${name}`);
    }
  }
  if (problems.length) throw new Error(`Pacote recusado:\n- ${problems.join("\n- ")}`);
  for (const name of REQUIRED_FILES) if (!files.has(name)) throw new Error(`Arquivo obrigatório ausente: ${name}`);

  // Deterministic archive (fixed timestamps, sorted entries).
  const mtime = new Date("2026-01-01T00:00:00Z");
  const entries = Object.fromEntries([...files.keys()].sort().map(name => [name, [files.get(name), { level: name.endsWith(".mp4") || name.endsWith(".png") || name.endsWith(".woff2") ? 0 : 9, mtime }]]));
  const zip = zipSync(entries);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(target, zip);

  // Verify: re-read, compare CRC32 of every entry and the exact file set.
  const extracted = unzipSync(readFileSync(target));
  const names = Object.keys(extracted).sort();
  if (names.length !== files.size) throw new Error("Quantidade de arquivos divergente no ZIP.");
  for (const name of names) {
    if (name.startsWith("/") || name.includes("..") || name.includes("\\")) throw new Error(`Caminho inseguro no ZIP: ${name}`);
    if (crc32(extracted[name]) !== crc32(files.get(name))) throw new Error(`CRC divergente: ${name}`);
  }
  const sha256 = createHash("sha256").update(readFileSync(target)).digest("hex");
  const size = statSync(target).size;
  const manifest = { file: zipName, channel, api_upstream: proxyTarget || null, bytes: size, sha256, files: names.length, csp_script_hashes: hashes.length, commit: gitCommit() };
  writeFileSync(join(outDir, zipName.replace(/\.zip$/, "-manifest.json")), JSON.stringify({ ...manifest, entries: names }, null, 2) + "\n");
  writeFileSync(join(outDir, `${zipName}.sha256`), `${sha256}  ${zipName}\n`);
  log(`✓ ${target}`);
  log(channel === "production"
    ? `  PRODUÇÃO · API ${proxyTarget}`
    : `  STAGING · ${proxyTarget ? `API não verificada: ${proxyTarget}` : "sem API configurada (o proxy responde 503)"} — NÃO publicar em produção`);
  log(`  ${(size / 1024 / 1024).toFixed(2)} MiB · ${names.length} arquivos · ${hashes.length} hashes CSP`);
  log(`  sha256 ${sha256}`);
}

main().catch(error => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
