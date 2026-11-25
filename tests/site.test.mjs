import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkSite } from "../scripts/check-links.mjs";
import { repositoryTarget } from "../scripts/links.mjs";
import { assertSafeTarget } from "../scripts/package.mjs";
import { createSlugger, flowchartToHtml, renderMarkdown } from "../scripts/markdown.mjs";

test("heading ids follow GitHub's slugs, including duplicates and punctuation", () => {
  const slug = createSlugger();
  assert.equal(slug("Native Apple Cluster (Apple silicon only)"), "native-apple-cluster-apple-silicon-only");
  assert.equal(slug("Get started — now"), "get-started--now");
  assert.equal(slug("`porto` CLI"), "porto-cli");
  assert.equal(slug("Windows"), "windows");
  assert.equal(slug("Windows"), "windows-1");
  assert.equal(slug("Windows 1"), "windows-1-1");
});

test("relative links resolve against the document's directory", () => {
  assert.equal(repositoryTarget("docs/installation.md", "../README.md#quickstart"), "README.md");
  assert.equal(repositoryTarget("docs/extensions.md", "../examples/extensions/resource-summary/"), "examples/extensions/resource-summary");
  assert.equal(repositoryTarget("docs/a.md", "#local"), null);
  assert.equal(repositoryTarget("docs/a.md", "https://example.com/x.md"), null);
  assert.throws(() => repositoryTarget("README.md", "../outside.md"), /outside the repository/);
});

test("links are rewritten through the resolver and code spans are left alone", () => {
  const { html } = renderMarkdown("# T\n\nSee [install](installation.md#macos) and `[not](a.md)` or **[bold](b.md)**.", {
    resolveLink: (url) => ({ href: url.replace(/\.md/, ".html") }),
  });
  assert.match(html, /<a href="installation\.html#macos">install<\/a>/);
  assert.match(html, /<code>\[not\]\(a\.md\)<\/code>/);
  assert.match(html, /<strong><a href="b\.html">bold<\/a><\/strong>/);
});

test("intraword underscores and HTML-like text stay literal", () => {
  const { html } = renderMarkdown("# T\n\nSet PORTO_LOG_LEVEL to debug for <project> names and _emphasis_.");
  assert.match(html, /PORTO_LOG_LEVEL/);
  assert.match(html, /&lt;project&gt;/);
  assert.match(html, /<em>emphasis<\/em>/);
});

test("fenced code inside an ordered list item keeps its content", () => {
  const markdown = "# T\n\n1. Build it:\n\n   ```sh\n   go build ./cmd/porto\n   ```\n\n2. Run it.\n";
  const { html } = renderMarkdown(markdown);
  assert.match(html, /<ol>\n<li><p>Build it:<\/p>\n<div class="code" data-lang="sh"><pre tabindex="0"><code class="language-sh">go build \.\/cmd\/porto<\/code><\/pre><\/div><\/li>\n<li><p>Run it\.<\/p><\/li>\n<\/ol>/);
});

test("tables keep alignment, escaped pipes and a labelled scroll region", () => {
  const { html } = renderMarkdown("# T\n\n## Matrix\n\n| A | B |\n| :-- | --: |\n| `a\\|b` | 2 |\n");
  assert.match(html, /<div class="table" role="region" aria-label="Table: Matrix" tabindex="0">/);
  assert.match(html, /<td class="align-left"><code>a\|b<\/code><\/td><td class="align-right">2<\/td>/);
});

test("alerts, front matter and leading H1 detection", () => {
  const alert = renderMarkdown("# T\n\n> [!WARNING]\n> **Careful.**\n").html;
  assert.match(alert, /<div class="alert alert-warning" role="note"><p class="alert-title">Warning<\/p>\n<p><strong>Careful\.<\/strong><\/p>/);

  const front = renderMarkdown("---\nname: porto\n---\n\n# Porto CLI\n");
  assert.equal(front.frontMatter, "name: porto");
  assert.equal(front.title, "Porto CLI");
  assert.equal(front.shifted, false);

  const twoTitles = renderMarkdown("# One\n\ntext\n\n# Two\n");
  assert.equal(twoTitles.shifted, true);
  assert.match(twoTitles.html, /<h2 id="one">One/);
  assert.match(twoTitles.html, /<h2 id="two">Two/);
});

test("simple Mermaid flowcharts become an accessible list, others fall back", () => {
  const html = flowchartToHtml("flowchart LR\n  UI[Dashboard] --> D[Daemon]\n  D -->|Pinned TLS| H[Remote host]");
  assert.match(html, /<span class="node">Dashboard<\/span> <span class="edge">connects to<\/span>/);
  assert.match(html, /<span class="node">Daemon<\/span> <span class="edge">Pinned TLS<\/span> <span class="arrow" aria-hidden="true">&rarr;<\/span> <span class="node">Remote host<\/span>/);
  assert.equal(flowchartToHtml("sequenceDiagram\n  A->>B: hi"), null);
});

test("the site check reports broken files, anchors and duplicate ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "porto-site-"));
  try {
    const page = (body) => `<!doctype html><html lang="en"><head><title>T</title></head><body><a class="skip-link" href="#content">Skip</a><main id="content"><h1 id="top">T</h1>${body}</main></body></html>`;
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "index.html"), page('<a href="docs/a.html#here">ok</a><a href="docs/a.html#gone">bad anchor</a><a href="missing.html">missing</a>'));
    await writeFile(join(root, "docs/a.html"), page('<p id="here">x</p><p id="here">y</p>'));
    const { problems } = await checkSite(root);
    assert.deepEqual(problems.sort(), [
      'docs/a.html: duplicate id "here"',
      "index.html: docs/a.html#gone has no #gone target",
      "index.html: missing.html does not exist",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packaging refuses to replace the repository, its parents or its folders", () => {
  const repo = join(tmpdir(), "site-repo");
  for (const target of ["/", repo, join(repo, ".."), join(repo, "docs"), join(repo, "vendor/porto")]) {
    assert.throws(() => assertSafeTarget(target, repo), /Refusing to replace/, target);
  }
  assert.equal(assertSafeTarget(join(repo, "dist"), repo), join(repo, "dist"));
  assert.equal(assertSafeTarget(join(tmpdir(), "pages"), repo), join(tmpdir(), "pages"));
});
