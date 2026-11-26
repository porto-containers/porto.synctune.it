// Serves a packaged website on 127.0.0.1 the way GitHub Pages does, for a local preview:
// /a serves a.html, /dir/ serves dir/index.html, /dir redirects to /dir/, /a.html still works
// and anything else gets 404.html with status 404.
//
//   node scripts/serve.mjs [directory, default dist] [--port 8080]
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

const isFile = (path) => stat(path).then((info) => info.isFile(), () => false);

// Maps a request path to { file } to serve, { redirect } to a directory URL, or {} for not found.
export async function route(root, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return {};
  }
  const target = join(root, path);
  if (target !== root && !target.startsWith(root + sep)) return {};
  if (path.endsWith("/")) {
    const index = join(target, "index.html");
    return (await isFile(index)) ? { file: index } : {};
  }
  if (await isFile(target)) return { file: target };
  if (await isFile(`${target}.html`)) return { file: `${target}.html` };
  if (await isFile(join(target, "index.html"))) return { redirect: `${pathname}/` };
  return {};
}

export function createSiteServer(directory) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const url = new URL(request.url, "http://localhost");
      const { file, redirect } = await route(root, url.pathname);
      if (redirect) {
        response.writeHead(301, { Location: `${redirect}${url.search}` }).end();
        return;
      }
      const path = file ?? join(root, "404.html");
      const body = await readFile(path).catch(() => null);
      if (!body) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found\n");
        return;
      }
      response.writeHead(file ? 200 : 404, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Content-Length": body.length });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Server error\n");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: "string", default: "8080" } } });
  const directory = resolve(positionals[0] ?? "dist");
  const port = Number(values.port);
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory() || !Number.isInteger(port)) {
    console.error(info?.isDirectory() ? `Invalid port ${values.port}` : `${directory} does not exist; run node scripts/package.mjs dist first`);
    console.error("Usage: node scripts/serve.mjs [directory] [--port 8080]");
    process.exit(2);
  }
  createSiteServer(directory).listen(port, "127.0.0.1", () => {
    console.log(`Serving ${directory} at http://127.0.0.1:${port}/ (stop with Ctrl+C)`);
  });
}
