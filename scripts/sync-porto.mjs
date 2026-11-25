// Copies the published Porto documents from one commit into vendor/porto and records
// the source commit, checksums and the GitHub target of every repository link.
//
//   node scripts/sync-porto.mjs --ref v1.11.6 [--source /path/to/porto/checkout]
//
// Without --source, the ref is shallow-cloned from GitHub into a temporary directory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { collectLinks } from "./markdown.mjs";
import { indexSource, pages, site, vendored } from "./pages.mjs";
import { repositoryTarget } from "./links.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = join(root, "vendor/porto");
const manifestPath = join(vendor, "SOURCE.json");

const { values } = parseArgs({ options: { ref: { type: "string" }, source: { type: "string" } } });
if (!values.ref) {
  console.error("Usage: node scripts/sync-porto.mjs --ref <tag-or-branch> [--source <porto checkout>]");
  process.exit(2);
}

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

let temporary = "";
let checkout = values.source;
try {
  if (!checkout) {
    temporary = mkdtempSync(join(tmpdir(), "porto-docs-"));
    checkout = temporary;
    console.log(`Cloning ${site.repository} at ${values.ref}...`);
    execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", values.ref, `https://github.com/${site.repository}.git`, checkout], { stdio: "inherit" });
  }
  const commit = git(checkout, "rev-parse", `${values.ref}^{commit}`).trim();
  const show = (path) => git(checkout, "show", `${commit}:${path}`);
  const kind = (path) => {
    try {
      const type = git(checkout, "cat-file", "-t", `${commit}:${path}`).trim();
      return type === "tree" ? "tree" : "blob";
    } catch {
      return null;
    }
  };

  const published = new Set(vendored);
  const upstreamDocs = git(checkout, "ls-tree", "--name-only", commit, "docs/").split("\n").filter((path) => path.endsWith(".md"));
  const unpublished = upstreamDocs.filter((path) => !published.has(path));
  if (unpublished.length) {
    throw new Error(`Add these documents to scripts/pages.mjs before syncing:\n  ${unpublished.join("\n  ")}`);
  }

  const previous = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));
  const documents = {};
  const links = {};
  const problems = [];
  const images = new Set();

  // Read and validate everything before replacing vendor/porto, so a failed sync changes nothing.
  const contents = new Map();
  for (const path of vendored) {
    const content = show(path);
    contents.set(path, content);
    documents[path] = createHash("sha256").update(content).digest("hex");
    for (const url of collectLinks(content)) {
      if (/^https?:/i.test(url) && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)|user-attachments\/assets/i.test(url)) images.add(url);
      const target = repositoryTarget(path, url);
      if (!target || published.has(target)) continue;
      const type = kind(target);
      if (type) links[target] = type;
      else problems.push(`${path}: ${url} does not exist at ${commit}`);
    }
  }
  if (problems.length) throw new Error(`Broken repository links:\n  ${problems.join("\n  ")}`);

  const assets = previous.assets ?? {};
  const unvendored = [...images].filter((url) => !assets[url] && !/\/badge\.svg/.test(url));
  for (const url of unvendored) console.warn(`Not vendored, rendered as a link: ${url}`);

  const tag = (() => {
    try {
      return git(checkout, "describe", "--tags", "--exact-match", commit).trim();
    } catch {
      return "";
    }
  })();
  const manifest = {
    repository: site.repository,
    ref: values.ref,
    commit,
    version: (tag || values.ref).replace(/^v/, ""),
    index: indexSource,
    documents: Object.fromEntries(Object.entries(documents).sort(([a], [b]) => a.localeCompare(b))),
    links: Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b))),
    assets,
    derived: previous.derived ?? {},
  };
  const staging = `${vendor}.next`;
  await rm(staging, { recursive: true, force: true });
  for (const [path, content] of contents) {
    await mkdir(dirname(join(staging, path)), { recursive: true });
    await writeFile(join(staging, path), content);
  }
  await writeFile(join(staging, "SOURCE.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(vendor, { recursive: true, force: true });
  await rename(staging, vendor);
  const files = await readdir(vendor, { recursive: true });
  console.log(`Vendored ${Object.keys(documents).length} documents (${files.length} entries) from ${site.repository}@${commit.slice(0, 7)} into ${relative(root, vendor)}.`);
  console.log(`Pages: ${pages.length}. Repository links: ${Object.keys(links).length}. Run node scripts/build.mjs next.`);
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}

