// Checks a packaged website: every local link, asset and anchor resolves, ids are unique and
// each page has the basic accessible structure. With --external, also requests outbound URLs.
//
//   node scripts/check-links.mjs <packaged directory> [--external]
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeEntities } from "./markdown.mjs";
import { site } from "./pages.mjs";

// Outbound links in vendored Porto docs that are known to fail for the public. Fix them upstream,
// then remove the entry. Listed URLs are reported as warnings instead of failures.
export const knownUnreachable = new Map([
  ["https://github.com/mbianchidev/etcqlite", "private repository linked from Porto's docs/integrations.md"],
]);

const PINNED = new RegExp(`^https://github\\.com/${site.repository.replace(".", "\\.")}/(?:blob|tree)/[0-9a-f]{40}/`);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => join(entry.parentPath, entry.name));
}

const exists = (path) => stat(path).then((info) => info, () => null);

function attributes(html, name) {
  return [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((match) => decodeEntities(match[1]));
}

export async function checkSite(directory) {
  const root = resolve(directory);
  const files = await htmlFiles(root);
  const ids = new Map();
  const pages = new Map();
  const problems = [];
  const warnings = [];
  const externals = new Map();

  for (const file of files) {
    const html = await readFile(file, "utf8");
    pages.set(file, html);
    const pageIds = attributes(html.replace(/<!--[\s\S]*?-->/g, ""), "id");
    const seen = new Set();
    for (const id of pageIds) {
      if (seen.has(id)) problems.push(`${relative(root, file)}: duplicate id "${id}"`);
      seen.add(id);
    }
    ids.set(file, seen);
  }

  for (const [file, html] of pages) {
    const name = relative(root, file);
    const body = html.replace(/<!--[\s\S]*?-->/g, "");
    if (!/<html lang="[a-z-]+"/.test(body)) problems.push(`${name}: missing <html lang>`);
    if (!/<title>[^<]+<\/title>/.test(body)) problems.push(`${name}: missing <title>`);
    if ((body.match(/<h1\b/g) ?? []).length !== 1) problems.push(`${name}: needs exactly one <h1>`);
    if (!/<main id="content"/.test(body)) problems.push(`${name}: missing <main id="content">`);
    if (!/class="skip-link" href="#content"/.test(body)) problems.push(`${name}: missing skip link`);
    for (const tag of body.match(/<img\b[^>]*>/g) ?? []) {
      if (!/\salt="/.test(tag)) problems.push(`${name}: image without alt text: ${tag.slice(0, 80)}`);
    }
    for (const [, inner] of body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      if (!decodeEntities(inner.replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/g, "$1").replace(/<[^>]+>/g, "")).trim()) problems.push(`${name}: link without text`);
    }
    let previous = 1;
    for (const [, level] of body.matchAll(/<h([1-6])\b/g)) {
      if (Number(level) > previous + 1) warnings.push(`${name}: heading level jumps from h${previous} to h${level}`);
      previous = Number(level);
    }

    const urls = [...attributes(body, "href"), ...attributes(body, "src")];
    for (const url of urls) {
      if (/^(mailto|tel):/i.test(url)) continue;
      let local = url;
      if (/^https?:\/\//i.test(url)) {
        const parsed = new URL(url);
        if (parsed.origin !== site.origin) {
          if (!PINNED.test(url)) externals.set(url, [...(externals.get(url) ?? []), name]);
          continue;
        }
        local = parsed.pathname + parsed.hash;
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        problems.push(`${name}: unsupported link ${url}`);
        continue;
      }
      const hashIndex = local.indexOf("#");
      const path = hashIndex < 0 ? local : local.slice(0, hashIndex);
      const hash = hashIndex < 0 ? "" : decodeURIComponent(local.slice(hashIndex + 1));
      let target = path ? (path.startsWith("/") ? join(root, path) : resolve(dirname(file), path)) : file;
      target = decodeURIComponent(target);
      if (!target.startsWith(root)) {
        problems.push(`${name}: ${url} leaves the site`);
        continue;
      }
      let info = await exists(target);
      if (info?.isDirectory()) {
        target = join(target, "index.html");
        info = await exists(target);
      } else if (!info && !extname(target)) {
        target = `${target}.html`;
        info = await exists(target);
      }
      if (!info) {
        problems.push(`${name}: ${url} does not exist`);
        continue;
      }
      if (hash && target.endsWith(".html") && !ids.get(target)?.has(hash)) problems.push(`${name}: ${url} has no #${hash} target`);
    }
  }
  return { problems, warnings, externals, pages: files.length };
}

async function request(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const method of ["HEAD", "GET"]) {
      try {
        const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "porto-website-link-check" } });
        await response.body?.cancel();
        if (method === "HEAD" && [403, 404, 405, 501].includes(response.status)) {
          last = `HTTP ${response.status}`;
          continue;
        }
        return { status: response.status };
      } catch (error) {
        last = error.cause?.code ?? error.name;
      }
    }
    await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
  }
  return { status: 0, error: last };
}

async function main() {
  const directory = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!directory) {
    console.error("Usage: node scripts/check-links.mjs <packaged directory> [--external]");
    process.exit(2);
  }
  const { problems, warnings, externals, pages } = await checkSite(directory);
  if (process.argv.includes("--external")) {
    const urls = [...externals.keys()];
    for (let index = 0; index < urls.length; index += 6) {
      const batch = await Promise.all(urls.slice(index, index + 6).map(async (url) => ({ url, ...(await request(url)) })));
      for (const { url, status, error } of batch) {
        const from = externals.get(url).slice(0, 3).join(", ");
        if (status === 429) warnings.push(`${url} is rate limited (linked from ${from})`);
        else if ((status < 200 || status >= 400) && knownUnreachable.has(url)) warnings.push(`${url} returned ${status || error}: ${knownUnreachable.get(url)}`);
        else if (status < 200 || status >= 400) problems.push(`${url} returned ${status || error} (linked from ${from})`);
      }
    }
    console.log(`Requested ${urls.length} external URLs.`);
  }
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(`Checked ${pages} pages; ${externals.size} external URLs ${process.argv.includes("--external") ? "requested" : "skipped (use --external)"}.`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
