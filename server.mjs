// Zero-dependency local dev server: static files + the /api/recs function.
// Run: npm run dev   (or: node server.mjs)   →  http://localhost:5173
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { handler: recs } = require("./netlify/functions/recs.js");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".ts": "text/plain; charset=utf-8",
};

async function serve(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/recs") {
    const r = await recs({ queryStringParameters: Object.fromEntries(url.searchParams) });
    res.writeHead(r.statusCode, r.headers);
    return res.end(r.body);
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.split("/").some((seg) => seg.startsWith(".") || seg === "node_modules")) return notFound(res);
  let file = path.resolve(root, "." + rel);
  if (!file.startsWith(root)) return notFound(res);
  try {
    let st = await fs.stat(file);
    if (st.isDirectory()) {
      if (!url.pathname.endsWith("/")) { res.writeHead(301, { Location: url.pathname + "/" }); return res.end(); }
      file = path.join(file, "index.html");
      st = await fs.stat(file);
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await fs.readFile(file));
  } catch { notFound(res); }
}
function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end('<body style="font-family:system-ui;padding:40px"><h1>404</h1><p>Nothing here. <a href="/">Back to the portfolio</a></p></body>');
}

function listen(port) {
  const server = http.createServer((req, res) => serve(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
  server.once("error", (e) => {
    if (e.code === "EADDRINUSE" && port < 5190) { console.log(`Port ${port} is busy, trying ${port + 1}…`); listen(port + 1); }
    else throw e;
  });
  server.listen(port, () => {
    console.log(`\n  Rohan's portfolio is running\n`);
    console.log(`  Local:      http://localhost:${port}/`);
    console.log(`  Music site: http://localhost:${port}/music/`);
    console.log(`  Bézier:     http://localhost:${port}/bezier/`);
    console.log(`  API:        http://localhost:${port}/api/recs?seed=0&k=5\n`);
  });
}
listen(Number(process.env.PORT) || 5173);
