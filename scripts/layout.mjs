import { escapeHtml } from "./markdown.mjs";
import { sections, site } from "./pages.mjs";

const CSP = "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";

export const logo = (prefix) =>
  `<img class="mark" src="${prefix}assets/favicon.svg" alt="" width="32" height="32">`;

export function header(prefix, current) {
  const link = (href, label, key) => `<a href="${prefix}${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="masthead">
  <div class="masthead-inner">
    <a class="brand" href="${prefix}index.html">${logo(prefix)}<span>Porto</span></a>
    <nav class="site-nav" aria-label="Site">
      ${link("docs/index.html", "Docs", "docs")}
      ${link("index.html#install", "Install", "install")}
      ${link("docs/index.html#contribute", "Contribute", "contribute")}
      <a href="https://github.com/${site.repository}" rel="noopener">GitHub<span class="visually-hidden"> repository</span> <span aria-hidden="true">&#8599;</span></a>
    </nav>
  </div>
</header>`;
}

export function footer(prefix, source) {
  const commit = source.commit.slice(0, 7);
  return `<footer class="site-footer">
  <div class="footer-inner">
    <p class="footer-brand">${logo(prefix)}<span>Porto is open source under the <a href="https://github.com/${site.repository}/blob/${source.commit}/LICENSE" rel="noopener">MIT license</a>.</span></p>
    <p>Documentation from <a href="https://github.com/${site.repository}/tree/${source.commit}" rel="noopener">Porto v${escapeHtml(source.version)} (<code>${commit}</code>)</a>. Not production-ready: use Porto for local development and experimentation.</p>
    <p>This site loads no analytics, cookies, fonts or third-party resources. A <a href="https://open.synctune.it/" rel="noopener">Synctune Open</a> project. <a href="https://github.com/porto-containers/porto.synctune.it" rel="noopener">Website source</a>.</p>
  </div>
</footer>`;
}

export function head({ prefix, title, description, path, noindex = false, image = "assets/social.png" }) {
  const indexing = noindex ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${site.origin}/${path}">`;
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#141516">
  <meta name="color-scheme" content="dark light">
  ${indexing}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Porto">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${site.origin}/${path}">
  <meta property="og:image" content="${site.origin}/${image}">
  <meta property="og:image:alt" content="The Porto dashboard with its resource rail and a managed k3s cluster.">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png">
  <link rel="stylesheet" href="${prefix}assets/styles.css">
  <script src="${prefix}assets/site.js" defer></script>`;
}

function sidebar(currentSlug) {
  const groups = sections
    .map((section) => {
      const items = section.pages
        .map((page) => `<li><a href="${page.slug}.html"${page.slug === currentSlug ? ' aria-current="page"' : ""}>${escapeHtml(page.title)}</a></li>`)
        .join("\n          ");
      return `<li class="nav-group">
        <p class="nav-label" id="nav-${section.id}">${escapeHtml(section.title)}</p>
        <ul aria-labelledby="nav-${section.id}">
          ${items}
        </ul>
      </li>`;
    })
    .join("\n      ");
  return `<nav class="docs-nav" aria-label="Documentation">
  <details class="collapsible" open>
    <summary>Browse the docs</summary>
    <ul class="nav-groups">
      <li class="nav-group"><ul><li><a href="index.html"${currentSlug === "index" ? ' aria-current="page"' : ""}>All documentation</a></li></ul></li>
      ${groups}
    </ul>
  </details>
</nav>`;
}

// Lists H2 sections; documents with fewer than three H2s also list their H3s beneath them.
function contents(headings) {
  const sections = headings.filter((heading) => heading.level === 2);
  const deep = sections.length < 3;
  const entries = [];
  for (const heading of headings) {
    if (heading.level === 2) entries.push({ heading, children: [] });
    else if (deep && heading.level === 3 && entries.length) entries.at(-1).children.push(heading);
  }
  const total = entries.reduce((sum, entry) => sum + 1 + entry.children.length, 0);
  if (total < 3) return "";
  const link = (heading) => `<a href="#${heading.id}">${escapeHtml(heading.text)}</a>`;
  const items = entries
    .map(({ heading, children }) => (children.length ? `<li>${link(heading)}<ol>${children.map((child) => `<li>${link(child)}</li>`).join("")}</ol></li>` : `<li>${link(heading)}</li>`))
    .join("\n      ");
  const label = deep ? `${total} headings` : `${sections.length} sections`;
  return `<nav class="toc${deep ? " deep" : ""}" aria-label="On this page">
  <details class="collapsible" open>
    <summary>On this page <span class="count">${label}</span></summary>
    <ol>
      ${items}
    </ol>
  </details>
</nav>
`;
}

export function docPage({ page, rendered, source, previous, next }) {
  const commit = source.commit;
  const sourceUrl = `https://github.com/${site.repository}/blob/${commit}/${page.source}`;
  const title = rendered.title || page.title;
  let body = rendered.html;
  const toc = contents(rendered.headings);
  if (rendered.shifted) {
    body = `<h1>${escapeHtml(page.title)}</h1>\n${toc}${body}`;
  } else {
    body = body.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>\n)/, `$1${toc}`);
  }
  const pager = [
    previous ? `<a class="pager-prev" href="${previous.slug}.html" rel="prev"><span class="pager-label">Previous</span> ${escapeHtml(previous.title)}</a>` : "",
    next ? `<a class="pager-next" href="${next.slug}.html" rel="next"><span class="pager-label">Next</span> ${escapeHtml(next.title)}</a>` : "",
  ].join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  ${head({ prefix: "../", title: `${page.title} | Porto docs`, description: page.summary, path: `docs/${page.slug}.html` })}
</head>
<body class="docs-page">
<a class="skip-link" href="#content">Skip to content</a>
${header("../", page.section.audience === "contributors" ? "contribute" : "docs")}
<div class="docs-shell">
${sidebar(page.slug)}
<main id="content" tabindex="-1">
  <p class="crumbs"><a href="index.html">Docs</a> <span aria-hidden="true">/</span> <a href="index.html#${page.section.id}">${escapeHtml(page.section.title)}</a></p>
  <article class="prose" aria-label="${escapeHtml(title)}">
${body}  </article>
  <aside class="doc-source" aria-label="Source">
    <p>From <a href="${sourceUrl}" rel="noopener"><code>${escapeHtml(page.source)}</code></a> in Porto v${escapeHtml(source.version)} (<code>${commit.slice(0, 7)}</code>). <a href="https://github.com/${site.repository}/issues" rel="noopener">Report a problem</a>.</p>
  </aside>
  <nav class="pager" aria-label="Previous and next pages">
    ${pager}
  </nav>
</main>
</div>
${footer("../", source)}
</body>
</html>
`;
}

export function docsIndex({ source }) {
  const block = (section) => {
    const cards = section.pages
      .map((page) => `<li><a href="${page.slug}.html"><span class="entry-title">${escapeHtml(page.title)}</span><span class="entry-summary">${escapeHtml(page.summary)}</span></a></li>`)
      .join("\n        ");
    return `<section class="doc-section" aria-labelledby="${section.id}">
      <h3 id="${section.id}">${escapeHtml(section.title)}</h3>
      <ul class="entries">
        ${cards}
      </ul>
    </section>`;
  };
  const users = sections.filter((section) => section.audience === "users").map(block).join("\n    ");
  const contributors = sections.filter((section) => section.audience === "contributors").map(block).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  ${head({ prefix: "../", title: "Porto documentation", description: "Guides for installing and using Porto, and for contributing to it.", path: "docs/index.html" })}
</head>
<body class="docs-page">
<a class="skip-link" href="#content">Skip to content</a>
${header("../", "docs")}
<div class="docs-shell">
${sidebar("index")}
<main id="content" tabindex="-1">
  <article class="prose docs-home" aria-label="Porto documentation">
    <p class="eyebrow">Porto v${escapeHtml(source.version)}</p>
    <h1>Porto documentation</h1>
    <p class="lede">How to install, run and troubleshoot Porto, and how to work on it. These pages are published from the <a href="https://github.com/${site.repository}/tree/${source.commit}" rel="noopener">Porto repository</a> at release v${escapeHtml(source.version)}.</p>
    <h2 id="use">Use Porto</h2>
    <p>New to Porto? Start with the <a href="overview.html#quickstart">quickstart</a>, then <a href="installation.html">installation</a> for platform details.</p>
    ${users}
    <h2 id="contribute">Contribute</h2>
    <p>Build Porto from source with the <a href="overview.html#build-from-source">source build steps</a>, read the <a href="overview.html#contributing">contributing notes</a>, then run the <a href="ci-cd.html#running-the-checks-locally">local checks</a> before opening a pull request.</p>
    ${contributors}
  </article>
</main>
</div>
${footer("../", source)}
</body>
</html>
`;
}
