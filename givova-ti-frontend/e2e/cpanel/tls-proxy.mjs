// Test-only TLS front: impersonates *.onrender.com API hosts for the PHP proxy.
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const upstreams = {
  "givova-e2e-nest.onrender.com": new URL(process.env.NEST_UPSTREAM),
  "givova-e2e-legacy.onrender.com": new URL(process.env.LEGACY_UPSTREAM),
};
const server = https.createServer({ key: readFileSync("/certs/api.key"), cert: readFileSync("/certs/api.crt") }, (req, res) => {
  const target = upstreams[(req.headers.host || "").split(":")[0]];
  if (!target) {
    res.writeHead(421).end();
    return;
  }
  const upstream = http.request(
    { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: `${target.hostname}:${target.port}` } },
    response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});
server.listen(443, () => console.log("tls proxy ready"));
