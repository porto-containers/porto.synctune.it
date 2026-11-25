// Copies the public website into an output directory for GitHub Pages or a local preview.
// Repository metadata, scripts, vendored Markdown and maintainer docs are not published.
//
//   node scripts/package.mjs <output directory>
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const publicFiles = ["index.html", "404.html", "robots.txt", "sitemap.xml", "CNAME", ".nojekyll", "assets"];

const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

// The output directory is replaced, so refuse the repository, its parents, the filesystem root
// and any folder inside the repository other than the ignored dist/.
export function assertSafeTarget(output, repository = root) {
  const target = resolve(output);
  const base = resolve(repository);
  if (target === parse(target).root || inside(target, base) || (inside(base, target) && relative(base, target) !== "dist")) {
    throw new Error(`Refusing to replace ${target}; choose dist/ or a directory outside the repository`);
  }
  return target;
}

export async function packageSite(output) {
  const target = assertSafeTarget(output);
  const existing = await stat(target).catch(() => null);
  if (existing && !existing.isDirectory()) throw new Error(`${target} is not a directory`);
  await rm(target, { recursive: true, force: true });
  await mkdir(join(target, "docs"), { recursive: true });
  for (const entry of publicFiles) {
    await stat(join(root, entry));
    await cp(join(root, entry), join(target, entry), { recursive: true });
  }
  const pages = (await readdir(join(root, "docs"))).filter((name) => name.endsWith(".html"));
  for (const name of pages) await cp(join(root, "docs", name), join(target, "docs", name));
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) {
    console.error("Usage: node scripts/package.mjs <output directory>");
    process.exit(2);
  }
  packageSite(output)
    .then((target) => console.log(`Packaged the website into ${target}.`))
    .catch((error) => {
      console.error(error.message ?? error);
      process.exitCode = 1;
    });
}
