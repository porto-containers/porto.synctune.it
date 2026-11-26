// Renders the vendored Porto documents into docs/*.html and writes sitemap.xml.
//
//   node scripts/build.mjs          write the generated files
//   node scripts/build.mjs --check  fail if any generated file is missing or stale
import { createHash } from "node:crypto";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { docPage, docsIndex, footer, head, header } from "./layout.mjs";
import { flowchartToHtml, renderMarkdown } from "./markdown.mjs";
import { githubUrl, repositoryTarget, splitHash } from "./links.mjs";
import { indexSource, pages, site } from "./pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = join(root, "vendor/porto");

export async function loadSource() {
  const source = JSON.parse(await readFile(join(vendor, "SOURCE.json"), "utf8"));
  const problems = [];
  for (const page of pages) {
    if (!source.documents[page.source]) problems.push(`${page.source} is not vendored; run scripts/sync-porto.mjs`);
  }
  for (const [path, sha256] of Object.entries(source.documents)) {
    const content = await readFile(join(vendor, path), "utf8").catch(() => null);
    if (content === null) problems.push(`vendor/porto/${path} is missing`);
    else if (createHash("sha256").update(content).digest("hex") !== sha256) problems.push(`vendor/porto/${path} differs from SOURCE.json; do not edit vendored files`);
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return source;
}

// Maps a Markdown link in a vendored document to a site page or a pinned GitHub URL.
// Site pages use clean URLs: `installation` for docs/installation.html, `./` for docs/index.html.
export function resolver(page, source) {
  const bySource = new Map(pages.map((entry) => [entry.source, entry]));
  const blob = new RegExp(`^https://github\\.com/${source.repository.replace(".", "\\.")}/blob/[^/]+/([^?#]+)(#.*)?$`);
  return (url) => {
    const published = url.match(blob);
    if (published && (bySource.has(published[1]) || published[1] === indexSource)) {
      const local = bySource.get(published[1]);
      return { href: `${local ? local.slug : "./"}${published[2] ?? ""}` };
    }
    const target = repositoryTarget(page.source, url);
    if (target === null) {
      const external = /^[a-z][a-z0-9+.-]*:/i.test(url);
      return { href: url, external };
    }
    const [, hash] = splitHash(url);
    const fragment = hash ? `#${hash}` : "";
    if (bySource.has(target)) return { href: `${bySource.get(target).slug}${fragment}` };
    if (target === indexSource) return { href: `./${fragment}` };
    const kind = source.links[target];
    if (!kind) throw new Error(`${page.source}: ${url} is not in SOURCE.json links; run scripts/sync-porto.mjs`);
    return { href: `${githubUrl(source.repository, kind, source.commit, target)}${fragment}`, external: true };
  };
}

// Hand-written pages mark shared regions with <!-- site:NAME attrs --> ... <!-- /site:NAME -->.
export const handWritten = ["index.html", "404.html"];

function injectChrome(html, source) {
  return html.replace(/<!-- site:(head|header|footer)((?: [a-z]+(?:="[^"]*")?)*) -->[\s\S]*?<!-- \/site:\1 -->/g, (match, region, rawAttributes) => {
    const attributes = Object.fromEntries([...rawAttributes.matchAll(/ ([a-z]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? true]));
    const prefix = attributes.prefix ?? "";
    const indent = region === "head" ? "  " : "";
    const content =
      region === "head"
        ? head({ prefix, title: attributes.title, description: attributes.description, path: attributes.path ?? "", noindex: Boolean(attributes.noindex) })
        : region === "header"
          ? header(prefix, attributes.current)
          : footer(prefix, source);
    const opening = match.slice(0, match.indexOf("-->") + 3);
    return `${opening}\n${indent}${content}\n${indent}<!-- /site:${region} -->`;
  });
}

export async function renderSite() {
  const source = await loadSource();
  const files = new Map();
  for (const [index, page] of pages.entries()) {
    const markdown = await readFile(join(vendor, page.source), "utf8");
    const rendered = renderMarkdown(markdown, {
      resolveLink: resolver(page, source),
      resolveImage(src) {
        const asset = source.assets?.[src];
        return asset ? { src: `../${asset.file}`, width: asset.width, height: asset.height } : null;
      },
      diagram: flowchartToHtml,
    });
    files.set(`docs/${page.slug}.html`, docPage({ page, rendered, source, previous: pages[index - 1], next: pages[index + 1] }));
  }
  files.set("docs/index.html", docsIndex({ source }));
  for (const path of handWritten) files.set(path, injectChrome(await readFile(join(root, path), "utf8"), source));
  const urls = ["", "docs/", ...pages.map((page) => `docs/${page.slug}`)];
  files.set(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${site.origin}/${url}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
  return files;
}

async function main() {
  const check = process.argv.includes("--check");
  const files = await renderSite();
  const generated = new Set(files.keys());
  const existing = (await readdir(join(root, "docs"))).filter((name) => name.endsWith(".html")).map((name) => `docs/${name}`);
  const stale = existing.filter((path) => !generated.has(path));
  const outdated = [];
  for (const [path, content] of files) {
    const current = await readFile(join(root, path), "utf8").catch(() => null);
    if (current === content) continue;
    if (check) outdated.push(path);
    else await writeFile(join(root, path), content);
  }
  if (check) {
    const problems = [...outdated.map((path) => `${path} is out of date`), ...stale.map((path) => `${path} is no longer generated`)];
    if (problems.length) {
      console.error(`Generated files differ from the sources. Run node scripts/build.mjs and commit the result.\n${problems.join("\n")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`All ${files.size} generated files are up to date.`);
    return;
  }
  for (const path of stale) await unlink(join(root, path));
  console.log(`Wrote ${files.size} generated files${stale.length ? ` and removed ${stale.length} stale pages` : ""}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
