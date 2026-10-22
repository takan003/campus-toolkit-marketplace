const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "site");
const docsHtml = fs.readFileSync(path.join(dir, "docs.html"), "utf8");
const indexHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");

function scriptOf(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("no script block");
  return m[1];
}

const docsScript = scriptOf(docsHtml);
const indexScript = scriptOf(indexHtml);
new Function(docsScript);
console.log("docs.html script: syntax OK");
new Function(indexScript);
console.log("index.html script: syntax OK");

const start = docsScript.indexOf("function escapeHtml");
const end = docsScript.indexOf("let currentDoc");
const fns = docsScript.slice(start, end);

const md = [
  "# 標題",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "1. 項一",
  "2. 項二",
  "",
  "- 列表 `code`",
  "`x` 與 **粗體** [連結](https://example.com)",
  "",
  "> 引用",
  "```ts",
  "const a=1;",
  "```",
  "<details open>",
  "<summary>更多</summary>",
  "",
  "內文",
  "</details>",
].join("\n");

const run = new Function(
  fns +
    "\nreturn { renderMarkdown: renderMarkdown, rawUrl: rawUrl, blobUrl: blobUrl };"
)();
const out = run.renderMarkdown(md);

const checks = {
  table: out.includes("<table>"),
  ol: out.includes("<ol>") && out.includes("<li>項一</li>"),
  ul: out.includes("<ul>") && out.includes("<li>列表 <code>code</code></li>"),
  pre: out.includes("<pre><code>const a=1;</code></pre>"),
  link: out.includes('href="https://example.com"'),
  details: out.includes("<details open>"),
  inlineCode: out.includes("<code>x</code>"),
  heading: out.includes("<h2>標題</h2>"),
  blockquote: out.includes("<blockquote>引用</blockquote>"),
  noRawHeading: !out.includes("<h2># 標題</h2>"),
};

let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

const sample = {
  raw: "https://raw.githubusercontent.com/takan003/campus-toolkit/main/",
  path: "docs/選用功能模組開發者指南.md",
  blob: "https://github.com/takan003/campus-toolkit/blob/main/",
};
console.log("rawUrl: " + run.rawUrl(sample));
console.log("blobUrl: " + run.blobUrl(sample));

const groupsMatch = docsScript.match(/const DOC_GROUPS = (\[[\s\S]*?\n      \]);/);
console.log("DOC_GROUPS declared: " + Boolean(groupsMatch));

process.exit(failed ? 1 : 0);
