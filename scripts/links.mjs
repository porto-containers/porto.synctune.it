import { posix } from "node:path";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function splitHash(url) {
  const index = url.indexOf("#");
  return index < 0 ? [url, ""] : [url.slice(0, index), url.slice(index + 1)];
}

// Resolves a relative Markdown link from a repository file to a repository path.
// Returns null for absolute URLs, protocol links and same-page anchors.
export function repositoryTarget(fromPath, url) {
  if (!url || SCHEME.test(url) || url.startsWith("#") || url.startsWith("//")) return null;
  const [path] = splitHash(url.split("?")[0]);
  if (!path) return null;
  const base = path.startsWith("/") ? "" : posix.dirname(fromPath);
  const target = posix.normalize(posix.join(base, decodeURIComponent(path))).replace(/^\/+/, "").replace(/\/+$/, "");
  if (target.startsWith("..")) throw new Error(`${fromPath}: ${url} points outside the repository`);
  return target === "." ? "" : target;
}

export function githubUrl(repository, kind, commit, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repository}/${kind}/${commit}/${encoded}`;
}
