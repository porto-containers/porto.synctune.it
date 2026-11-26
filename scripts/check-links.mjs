// Checks a packaged website: every local link, asset and anchor resolves, ids are unique and
// each page has the basic accessible structure. With --external, also requests outbound URLs.
//
// Local links follow GitHub Pages clean URLs: `a` serves a.html and `dir/` serves dir/index.html.
// Links ending in .html, and links to a directory without the trailing slash (Pages answers
// with a redirect), are reported. Sitemap entries and og:url follow the same rules.
//
//   node scripts/check-links.mjs <packaged directory> [--external]
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeEntities } from "./markdown.mjs";
import { site } from "./pages.mjs";

const PINNED = new RegExp(`^https://github\\.com/${site.repository.replace(".", "\\.")}/(?:blob|tree)/[0-9a-f]{40}/`);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => join(entry.parentPath, entry.name));
}

const isFile = (path) => stat(path).then((info) => info.isFile(), () => false);

// Resolves a local URL path (no fragment) from the page `from` to a file under `root`.
// Returns { target }, or { problem } and an optional corrected path in `fix`.
async function resolveLocal(root, from, path) {
  if (!path) return { target: from };
  const decoded = decodeURIComponent(path);
  if (/\.html$/i.test(decoded)) {
    return { problem: "ends in .html", fix: path.replace(/(^|\/)index\.html$/i, "$1").replace(/\.html$/i, "") || "./" };
  }
  const target = decoded.startsWith("/") ? join(root, decoded) : resolve(dirname(from), decoded);
  if (target !== root && !target.startsWith(root + sep)) return { problem: "leaves the site" };
  if (/(^|\/)(\.\.?)?$/.test(decoded)) {
    const index = join(target, "index.html");
    return (await isFile(index)) ? { target: index } : { problem: "does not exist" };
  }
  if (await isFile(target)) return { target };
  if (await isFile(`${target}.html`)) return { target: `${target}.html` };
  if (await isFile(join(target, "index.html"))) return { problem: "is a directory without the trailing slash, which GitHub Pages redirects", fix: `${path}/` };
  return { problem: "does not exist" };
}

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

    const ogUrls = [...body.matchAll(/<meta property="og:url" content="([^"]*)"/g)].map((match) => decodeEntities(match[1]));
    const urls = [...attributes(body, "href"), ...attributes(body, "src"), ...ogUrls];
    for (const url of urls) {
      if (/^(mailto|tel):/i.test(url)) continue;
      let local = url;
      const absolute = /^https?:\/\//i.test(url);
      if (absolute) {
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
      const { target, problem, fix } = await resolveLocal(root, file, path);
      if (problem) {
        const suggestion = fix ? `; use ${absolute ? site.origin : ""}${fix}${hashIndex < 0 ? "" : local.slice(hashIndex)}` : "";
        problems.push(`${name}: ${url} ${problem}${suggestion}`);
        continue;
      }
      if (hash && target.endsWith(".html") && !ids.get(target)?.has(hash)) problems.push(`${name}: ${url} has no #${hash} target`);
    }
  }

  const sitemap = await readFile(join(root, "sitemap.xml"), "utf8").catch(() => null);
  for (const [, loc] of sitemap?.matchAll(/<loc>([^<]*)<\/loc>/g) ?? []) {
    const url = decodeEntities(loc);
    if (!url.startsWith(`${site.origin}/`)) {
      problems.push(`sitemap.xml: ${url} is not on ${site.origin}`);
      continue;
    }
    const path = new URL(url).pathname;
    const { problem, fix } = await resolveLocal(root, join(root, "index.html"), path);
    if (problem) problems.push(`sitemap.xml: ${url} ${problem}${fix ? `; use ${site.origin}${fix}` : ""}`);
  }
  return { problems, warnings, externals, pages: files.length };
}

const transient = (status) => status === 429 || status >= 500;

// Retries server errors, rate limits and network failures with backoff.
async function request(url) {
  let result = { status: 0, error: "" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((done) => setTimeout(done, 2000 * attempt));
    for (const method of ["HEAD", "GET"]) {
      try {
        const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "porto-website-link-check" } });
        await response.body?.cancel();
        result = { status: response.status };
        if (method === "HEAD" && [403, 404, 405, 501].includes(response.status)) continue;
        break;
      } catch (error) {
        result = { status: 0, error: error.cause?.code ?? error.name };
      }
    }
    if (result.status && !transient(result.status)) return result;
    if (result.error === "ENOTFOUND") return result;
  }
  return result;
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
        const failed = status < 200 || status >= 400;
        if (failed && (transient(status) || (!status && error !== "ENOTFOUND"))) warnings.push(`${url} is temporarily unavailable (${status || error}) after retries (linked from ${from})`);
        else if (failed) problems.push(`${url} returned ${status || error} (linked from ${from})`);
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
