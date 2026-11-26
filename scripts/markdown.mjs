// A small GitHub-flavoured Markdown renderer built only on the JavaScript standard library.
// It covers the syntax used by Porto's documentation: ATX headings, paragraphs, lists,
// fenced code, tables, block quotes and GitHub alerts, links, images, emphasis,
// autolinks, issue references, front matter and simple Mermaid flowcharts.

const ENTITY = /&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g;
const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeText(value) {
  return value.replace(ENTITY, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

export function textContent(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ""));
}

// Matches github-slugger: lower-case, drop punctuation and symbols, spaces become hyphens.
export function createSlugger() {
  const seen = new Map();
  return (text) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    let slug = base;
    let count = seen.get(base) ?? 0;
    while (seen.has(slug)) slug = `${base}-${++count}`;
    seen.set(base, count);
    seen.set(slug, 0);
    return slug;
  };
}

const isBlank = (line) => /^[ \t]*$/.test(line);

function expandTabs(line) {
  let column = 0;
  let out = "";
  for (const char of line) {
    if (char === "\t") {
      const width = 4 - (column % 4);
      out += " ".repeat(width);
      column += width;
    } else {
      out += char;
      column += 1;
    }
  }
  return out;
}

function stripIndent(line, count) {
  let index = 0;
  while (index < count && line[index] === " ") index += 1;
  return line.slice(index);
}

function startsBlock(line, interruptingParagraph = true) {
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  if (/^ {0,3}<!--/.test(line) || /^ {0,3}<img\b/i.test(line)) return true;
  const item = line.match(ITEM);
  if (item && item[3] !== undefined) {
    if (!interruptingParagraph) return true;
    return !/^\d/.test(item[2]) || /^1[.)]$/.test(item[2]);
  }
  return false;
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells = [];
  let current = "";
  for (let index = 0; index < row.length; index += 1) {
    if (row[index] === "\\" && row[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (row[index] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += row[index];
    }
  }
  cells.push(current.trim());
  return cells;
}

class Renderer {
  constructor(options) {
    this.options = options;
    this.slug = createSlugger();
    this.headings = [];
    this.section = "";
    this.placeholders = [];
  }

  hold(html) {
    this.placeholders.push(html);
    return `\u0000${this.placeholders.length - 1}\u0000`;
  }

  restore(text) {
    let out = text;
    while (/\u0000\d+\u0000/.test(out)) out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => this.placeholders[Number(index)]);
    return out;
  }

  link(url) {
    return this.options.resolveLink ? this.options.resolveLink(url) : { href: url };
  }

  anchor(url, content, className = "") {
    const target = this.link(url);
    const rel = target.external ? ' rel="noopener"' : "";
    const cls = className ? ` class="${className}"` : "";
    return `<a${cls} href="${escapeHtml(target.href)}"${rel}>${content}</a>`;
  }

  image(src, alt, insideLink) {
    const asset = this.options.resolveImage ? this.options.resolveImage(src) : null;
    if (asset) {
      const size = asset.width ? ` width="${asset.width}" height="${asset.height}"` : "";
      return `<img src="${escapeHtml(asset.src)}" alt="${escapeHtml(alt)}"${size} loading="lazy" decoding="async">`;
    }
    const label = escapeText(alt || src);
    return insideLink ? label : this.anchor(src, label);
  }

  // Parses a link destination and optional title after `](`; returns the URL and end index.
  destination(text, start) {
    let index = start;
    while (text[index] === " ") index += 1;
    let url = "";
    if (text[index] === "<") {
      const end = text.indexOf(">", index);
      if (end < 0) return null;
      url = text.slice(index + 1, end);
      index = end + 1;
    } else {
      let depth = 0;
      while (index < text.length) {
        const char = text[index];
        if (char === "\\" && PUNCTUATION.test(text[index + 1] ?? "")) {
          url += text[index + 1];
          index += 2;
          continue;
        }
        if (char === " " || char === "\n") break;
        if (char === "(") depth += 1;
        if (char === ")") {
          if (depth === 0) break;
          depth -= 1;
        }
        url += char;
        index += 1;
      }
    }
    while (text[index] === " " || text[index] === "\n") index += 1;
    if (text[index] === '"' || text[index] === "'") {
      const quote = text[index];
      const end = text.indexOf(quote, index + 1);
      if (end < 0) return null;
      index = end + 1;
      while (text[index] === " ") index += 1;
    }
    if (text[index] !== ")") return null;
    return { url: decodeEntities(url), end: index + 1 };
  }

  closingBracket(text, start) {
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\\") {
        index += 1;
      } else if (char === "`") {
        const run = text.slice(index).match(/^`+/)[0];
        const close = text.indexOf(run, index + run.length);
        if (close >= 0) index = close + run.length - 1;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        if (depth === 0) return index;
        depth -= 1;
      }
    }
    return -1;
  }

  inline(text, insideLink = false) {
    let buffer = "";
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      const rest = text.slice(index);
      if (char === "\\" && text[index + 1] === "\n") {
        buffer += this.hold("<br>\n");
        index += 2;
      } else if (char === "\\" && PUNCTUATION.test(text[index + 1] ?? "")) {
        buffer += this.hold(escapeHtml(text[index + 1]));
        index += 2;
      } else if (char === "`") {
        const run = rest.match(/^`+/)[0];
        let close = index + run.length;
        let found = -1;
        while ((close = text.indexOf(run, close)) >= 0) {
          if (text[close + run.length] !== "`" && text[close - 1] !== "`") {
            found = close;
            break;
          }
          close += run.length;
        }
        if (found < 0) {
          buffer += run;
          index += run.length;
          continue;
        }
        let code = text.slice(index + run.length, found).replace(/\n/g, " ");
        if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
        buffer += this.hold(`<code>${escapeHtml(code)}</code>`);
        index = found + run.length;
      } else if (char === "<") {
        const autolink = rest.match(/^<(https?:\/\/[^\s<>]+)>/i);
        const comment = rest.match(/^<!--[\s\S]*?-->/);
        const lineBreak = rest.match(/^<br\s*\/?>/i);
        if (autolink && !insideLink) {
          buffer += this.hold(this.anchor(autolink[1], escapeText(autolink[1])));
          index += autolink[0].length;
        } else if (comment) {
          index += comment[0].length;
        } else if (lineBreak) {
          buffer += this.hold("<br>");
          index += lineBreak[0].length;
        } else {
          buffer += "&lt;";
          index += 1;
        }
      } else if (char === "[" || (char === "!" && text[index + 1] === "[")) {
        const isImage = char === "!";
        const open = index + (isImage ? 1 : 0);
        const close = this.closingBracket(text, open + 1);
        const target = close >= 0 && text[close + 1] === "(" ? this.destination(text, close + 2) : null;
        if (!target || (!isImage && insideLink)) {
          buffer += escapeText(text.slice(index, open + 1));
          index = open + 1;
          continue;
        }
        const label = text.slice(open + 1, close);
        if (isImage) {
          buffer += this.hold(this.image(target.url, textContent(this.restore(this.inline(label, true))), insideLink));
        } else {
          // A link around an image that cannot be shown locally, such as a CI badge, becomes a text badge.
          const badge = label.trim().match(/^!\[[^\]]*\]\(([^)\s]+)[^)]*\)$/);
          const unresolved = badge && !(this.options.resolveImage && this.options.resolveImage(badge[1]));
          buffer += this.hold(this.anchor(target.url, this.inline(label, true), unresolved ? "badge" : ""));
        }
        index = target.end;
      } else {
        buffer += escapeText(char);
        index += 1;
      }
    }

    buffer = buffer
      .replace(/\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<![\p{L}\p{N}_])__(?!\s)([\s\S]+?)(?<!\s)__(?![\p{L}\p{N}_])/gu, "<strong>$1</strong>")
      .replace(/(?<![*\p{L}\p{N}])\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?![*\p{L}\p{N}])/gu, "<em>$1</em>")
      .replace(/(?<![\p{L}\p{N}_])_(?![\s_])([\s\S]+?)(?<![\s_])_(?![\p{L}\p{N}_])/gu, "<em>$1</em>");

    if (!insideLink) {
      buffer = buffer.replace(/(^|[\s(])(https?:\/\/[^\s<"\u0000]*[^\s<"\u0000.,:;'!?)\]*_])/g, (_, before, url) => `${before}${this.hold(this.anchor(decodeEntities(url), url))}`);
      if (this.options.issueUrl) {
        buffer = buffer.replace(/(^|[\s(])#(\d+)\b/g, (_, before, number) => `${before}${this.hold(`<a href="${escapeHtml(this.options.issueUrl(number))}" rel="noopener">#${number}</a>`)}`);
      }
    }
    return insideLink ? buffer : this.restore(buffer);
  }

  span(text) {
    return this.restore(this.inline(text.replace(/ {2,}\n/g, "\\\n").replace(/[ \t]+$/, "")));
  }

  heading(level, raw) {
    const html = this.span(raw ?? "");
    const text = textContent(html).trim();
    const id = this.slug(text);
    const shifted = Math.min(6, level + (this.options.shiftHeadings ? 1 : 0));
    this.headings.push({ level: shifted, id, text, source: level });
    if (shifted <= 3) this.section = text;
    const anchor = shifted > 1 ? `<a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>` : "";
    return `<h${shifted} id="${id}">${html}${anchor}</h${shifted}>\n`;
  }

  code(lines, info) {
    const language = (info.trim().split(/\s+/)[0] || "").toLowerCase();
    const source = lines.join("\n");
    if (language === "mermaid" && this.options.diagram) {
      const diagram = this.options.diagram(source);
      if (diagram) return diagram;
    }
    const label = language ? ` data-lang="${escapeHtml(language)}"` : "";
    const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
    return `<div class="code"${label}><pre tabindex="0"><code${cls}>${escapeHtml(source)}</code></pre></div>\n`;
  }

  table(header, align, rows) {
    const cell = (tag, content, column) => {
      const alignment = align[column] ? ` class="align-${align[column]}"` : "";
      return `<${tag}${tag === "th" ? ' scope="col"' : ""}${alignment}>${this.span(content ?? "")}</${tag}>`;
    };
    const head = header.map((content, column) => cell("th", content, column)).join("");
    const body = rows.map((row) => `<tr>${header.map((_, column) => cell("td", row[column], column)).join("")}</tr>`).join("\n");
    const label = escapeHtml(this.section ? `Table: ${this.section}` : "Table");
    return `<div class="table" role="region" aria-label="${label}" tabindex="0"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>\n`;
  }

  htmlImage(line) {
    const attributes = Object.fromEntries([...line.matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)].map((match) => [match[1].toLowerCase(), decodeEntities(match[2])]));
    if (!attributes.src) return `<p>${escapeText(line.trim())}</p>\n`;
    return `<p>${this.image(attributes.src, attributes.alt ?? "", false)}</p>\n`;
  }

  blocks(lines) {
    let html = "";
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (isBlank(line)) {
        index += 1;
        continue;
      }

      const fence = line.match(FENCE);
      if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
        const indent = fence[1].length;
        const marker = fence[2];
        const body = [];
        index += 1;
        while (index < lines.length) {
          const closing = lines[index].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
          if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) {
            index += 1;
            break;
          }
          body.push(stripIndent(lines[index], indent));
          index += 1;
        }
        html += this.code(body, fence[3]);
        continue;
      }

      const heading = line.match(HEADING);
      if (heading) {
        html += this.heading(heading[1].length, heading[2]);
        index += 1;
        continue;
      }

      if (RULE.test(line)) {
        html += "<hr>\n";
        index += 1;
        continue;
      }

      if (/^ {0,3}<!--/.test(line)) {
        while (index < lines.length && !lines[index].includes("-->")) index += 1;
        index += 1;
        continue;
      }

      if (/^ {0,3}<img\b/i.test(line)) {
        let tag = line;
        while (!tag.includes(">") && index + 1 < lines.length) tag += ` ${lines[++index]}`;
        html += this.htmlImage(tag);
        index += 1;
        continue;
      }

      if (QUOTE.test(line)) {
        const body = [];
        while (index < lines.length) {
          if (QUOTE.test(lines[index])) body.push(lines[index].replace(QUOTE, ""));
          else if (!isBlank(lines[index]) && !isBlank(body.at(-1) ?? "") && !startsBlock(lines[index])) body.push(lines[index]);
          else break;
          index += 1;
        }
        const first = body.findIndex((entry) => !isBlank(entry));
        const alert = first >= 0 ? body[first].trim().match(ALERT) : null;
        if (alert) {
          const kind = alert[1].toLowerCase();
          const title = kind[0].toUpperCase() + kind.slice(1);
          html += `<div class="alert alert-${kind}" role="note"><p class="alert-title">${title}</p>\n${this.blocks(body.slice(first + 1))}</div>\n`;
        } else {
          html += `<blockquote>\n${this.blocks(body)}</blockquote>\n`;
        }
        continue;
      }

      if (line.includes("|") && DELIMITER.test(lines[index + 1] ?? "") && (lines[index + 1] ?? "").includes("-")) {
        const header = splitRow(line);
        const align = splitRow(lines[index + 1]).map((spec) => (spec.startsWith(":") && spec.endsWith(":") ? "center" : spec.endsWith(":") ? "right" : spec.startsWith(":") ? "left" : ""));
        if (align.length === header.length) {
          const rows = [];
          index += 2;
          while (index < lines.length && !isBlank(lines[index]) && lines[index].includes("|") && !startsBlock(lines[index])) {
            rows.push(splitRow(lines[index]));
            index += 1;
          }
          html += this.table(header, align, rows);
          continue;
        }
      }

      const item = line.match(ITEM);
      if (item && item[3] !== undefined) {
        const result = this.list(lines, index);
        html += result.html;
        index = result.index;
        continue;
      }

      const paragraph = [line.trimStart()];
      index += 1;
      while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index])) {
        if (lines[index].includes("|") && DELIMITER.test(lines[index + 1] ?? "") && (lines[index + 1] ?? "").includes("-")) break;
        paragraph.push(lines[index].replace(/^[ \t]+/, ""));
        index += 1;
      }
      html += `<p>${this.span(paragraph.join("\n"))}</p>\n`;
    }
    return html;
  }

  list(lines, start) {
    const first = lines[start].match(ITEM);
    const ordered = /^\d/.test(first[2]);
    const delimiter = first[2].slice(-1);
    const items = [];
    let loose = false;
    let index = start;

    while (index < lines.length) {
      const match = lines[index].match(ITEM);
      if (!match || match[3] === undefined) break;
      const sameKind = ordered ? /^\d/.test(match[2]) && match[2].endsWith(delimiter) : match[2] === first[2];
      if (!sameKind) break;
      const spacing = match[3].length > 4 ? 1 : match[3].length;
      const offset = match[1].length + match[2].length + spacing;
      const body = [match[3].length > 4 ? " ".repeat(match[3].length - 1) + match[4] : match[4] ?? ""];
      index += 1;
      let blank = false;
      while (index < lines.length) {
        const next = lines[index];
        if (isBlank(next)) {
          blank = true;
          body.push("");
          index += 1;
          continue;
        }
        const indent = next.match(/^ */)[0].length;
        if (indent >= offset) {
          if (blank) loose = true;
          blank = false;
          body.push(next.slice(offset));
          index += 1;
          continue;
        }
        if (!blank && !startsBlock(next, false) && !isBlank(body.at(-1))) {
          body.push(next.trim());
          index += 1;
          continue;
        }
        break;
      }
      while (body.length && isBlank(body.at(-1))) body.pop();
      items.push(body);
      const after = lines[index];
      if (blank && after !== undefined && ITEM.test(after)) loose = true;
      if (blank && (after === undefined || !ITEM.test(after))) break;
    }

    const tag = ordered ? "ol" : "ul";
    const number = ordered ? Number.parseInt(first[2], 10) : 1;
    const startAttribute = ordered && number !== 1 ? ` start="${number}"` : "";
    const content = items
      .map((body) => {
        let inner = this.blocks(body);
        if (!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>\n/, "$1\n");
        return `<li>${inner.trimEnd()}</li>`;
      })
      .join("\n");
    return { html: `<${tag}${startAttribute}>\n${content}\n</${tag}>\n`, index };
  }
}

export function splitFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return match ? { frontMatter: match[1], body: source.slice(match[0].length) } : { frontMatter: "", body: source };
}

function render(source, options) {
  const { frontMatter, body } = splitFrontMatter(source.replace(/\r\n?/g, "\n"));
  const renderer = new Renderer(options);
  const lines = body.split("\n").map(expandTabs);
  let html = renderer.blocks(lines);
  if (frontMatter) {
    html = `<details class="front-matter"><summary>Front matter</summary>\n${renderer.code(frontMatter.split("\n"), "yaml")}</details>\n${html}`;
  }
  return { html, headings: renderer.headings, frontMatter };
}

// Renders Markdown to HTML. When a document has no single leading H1, headings are shifted
// one level down so the page template can supply the only H1.
export function renderMarkdown(source, options = {}) {
  let result = render(source, options);
  const topLevel = result.headings.filter((heading) => heading.source === 1);
  const leading = /^\s*(?:<details[\s\S]*?<\/details>\s*)?<h1\b/.test(result.html);
  if (topLevel.length !== 1 || !leading) {
    result = render(source, { ...options, shiftHeadings: true });
    return { ...result, title: "", shifted: true };
  }
  return { ...result, title: topLevel[0].text, shifted: false };
}

// Returns every link and image destination in a document, in source order.
export function collectLinks(source) {
  const urls = [];
  renderMarkdown(source, {
    resolveLink(url) {
      urls.push(url);
      return { href: "#" };
    },
    resolveImage(src) {
      urls.push(src);
      return null;
    },
  });
  return [...new Set(urls)];
}

// Renders a Mermaid `flowchart` or `graph` of labelled nodes and edges as an accessible list.
// Returns null for anything more complex so callers can fall back to showing the source.
export function flowchartToHtml(source) {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines.shift()?.match(/^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)$/);
  if (!header) return null;
  const labels = new Map();
  const node = /^([A-Za-z][\w-]*)(?:\[([^\]]+)\])?/;
  const edges = [];
  for (const line of lines) {
    const from = line.match(node);
    if (!from) return null;
    if (from[2]) labels.set(from[1], from[2]);
    const rest = line.slice(from[0].length).trim();
    if (!rest) continue;
    const arrow = rest.match(/^-->(?:\|([^|]+)\|)?\s*/);
    if (!arrow) return null;
    const to = rest.slice(arrow[0].length).match(node);
    if (!to || rest.slice(arrow[0].length + to[0].length).trim()) return null;
    if (to[2]) labels.set(to[1], to[2]);
    edges.push({ from: from[1], to: to[1], label: arrow[1]?.trim() ?? "" });
  }
  if (!edges.length) return null;
  const name = (id) => `<span class="node">${escapeHtml(labels.get(id) ?? id)}</span>`;
  const items = edges
    .map(({ from, to, label }) => {
      const via = label ? `<span class="edge">${escapeHtml(label)}</span>` : `<span class="edge">connects to</span>`;
      return `<li>${name(from)} ${via} <span class="arrow" aria-hidden="true">&rarr;</span> ${name(to)}</li>`;
    })
    .join("\n");
  return `<figure class="flow">\n<figcaption>Diagram: how the components connect</figcaption>\n<ul>\n${items}\n</ul>\n</figure>\n`;
}
