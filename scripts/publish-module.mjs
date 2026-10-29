import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ZIP_BYTES = 500 * 1024;
const MAX_NOTES = 3;
const EXCLUDED_NAMES = new Set([".git", "node_modules", ".next", "package-lock.json"]);
const RAW_RELEASES_BASE =
  "https://raw.githubusercontent.com/takan003/campus-toolkit-marketplace/main/releases";
const GITHUB_BASE = "https://github.com/takan003";

function fail(message) {
  console.error(`[publish] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path.relative(ROOT, filePath)} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf-8",
    ...options,
  });
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} 失敗：\n${(result.stderr || "").trim()}\n${(result.stdout || "").trim()}`
    );
  }
  return result;
}

function git(args, options = {}) {
  return run("git", args, options);
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function createZip(sourceDir, zipPath) {
  fs.rmSync(zipPath, { force: true });

  if (process.platform === "win32") {
    const items = fs
      .readdirSync(sourceDir, { withFileTypes: true })
      .filter((entry) => !EXCLUDED_NAMES.has(entry.name) && !entry.name.endsWith(".log"))
      .map((entry) => path.join(sourceDir, entry.name));
    if (items.length === 0) {
      fail(`模組目錄是空的：${sourceDir}`);
    }
    const pathList = items.map((item) => quotePowerShell(item)).join(",");
    const command = `Compress-Archive -Path @(${pathList}) -DestinationPath ${quotePowerShell(zipPath)} -Force`;
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
    return;
  }

  run("zip", [
    "-r",
    "-q",
    zipPath,
    ".",
    "-x",
    "node_modules/*",
    ".git/*",
    ".next/*",
    "package-lock.json",
    "*.log",
  ], { cwd: sourceDir });
}

function parseArgs(argv) {
  const options = {
    modulePath: null,
    push: false,
    commit: true,
    validate: true,
    category: null,
    tags: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--push") options.push = true;
    else if (arg === "--skip-commit" || arg === "--no-commit") options.commit = false;
    else if (arg === "--skip-validate" || arg === "--no-validate") options.validate = false;
    else if (arg === "--category") options.category = argv[++i] ?? null;
    else if (arg === "--tags") options.tags = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "用法：npm run publish -- <模組 repo 路徑> [--push] [--skip-commit] [--skip-validate] [--category 類別] [--tags a,b]",
          "",
          "自動完成：壓縮 release、複製 module.json、更新 index/site、產生 notes.txt、驗證。",
        ].join("\n")
      );
      process.exit(0);
    } else if (arg.startsWith("--")) {
      fail(`未知參數：${arg}`);
    } else if (!options.modulePath) {
      options.modulePath = arg;
    } else {
      fail(`只能指定一個模組路徑，多出來的是：${arg}`);
    }
  }

  if (!options.modulePath) {
    fail("請指定模組 repo 路徑，例如：npm run publish -- ..\\selfDirectedLearning");
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const moduleDir = path.resolve(process.cwd(), options.modulePath);
const manifestPath = path.join(moduleDir, "module.json");
if (!fs.existsSync(manifestPath)) {
  fail(`找不到 module.json：${manifestPath}`);
}

const manifest = readJson(manifestPath);
const id = typeof manifest.value === "string" ? manifest.value.trim() : "";
const version =
  manifest && manifest.author && typeof manifest.author.version === "string"
    ? manifest.author.version.trim()
    : "";
const minHostVersion =
  typeof manifest.minHostVersion === "string" ? manifest.minHostVersion.trim() : "";

if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) {
  fail(`module.json 的 value 不合法：${id || "(空)"}`);
}
if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
  fail(`module.json 的 author.version 不是版本格式：${version || "(空)"}`);
}
if (!/^\d+\.\d+(?:\.\d+)?$/.test(minHostVersion)) {
  fail(`module.json 的 minHostVersion 不是版本格式：${minHostVersion || "(空)"}`);
}

const changelog = Array.isArray(manifest.changelog) ? manifest.changelog : [];
const latestEntry = changelog[0];
if (!latestEntry || latestEntry.version !== version) {
  fail(
    `module.json 的 changelog[0].version（${latestEntry?.version ?? "缺少"}）必須等於 author.version（${version}）`
  );
}
if (!Array.isArray(latestEntry.notes)) {
  fail("module.json 的 changelog[0].notes 必須是陣列");
}

let releaseNotes = latestEntry.notes
  .map((note) => (typeof note === "string" ? note.trim() : ""))
  .filter(Boolean);
if (releaseNotes.length === 0) {
  fail("module.json 的 changelog[0].notes 沒有可用內容");
}
if (releaseNotes.length > MAX_NOTES) {
  console.warn(
    `[publish] changelog[0].notes 有 ${releaseNotes.length} 點，依規則只取前 ${MAX_NOTES} 點；其餘請刪除或合併。`
  );
  releaseNotes = releaseNotes.slice(0, MAX_NOTES);
}

const indexFiles = [path.join(ROOT, "index.json"), path.join(ROOT, "site", "index.json")];
const indexes = indexFiles.map((filePath) => {
  if (!fs.existsSync(filePath)) fail(`缺少 ${path.relative(ROOT, filePath)}`);
  const index = readJson(filePath);
  if (!Array.isArray(index.modules)) fail(`${path.relative(ROOT, filePath)} 缺少 modules 陣列`);
  return index;
});

const existing =
  indexes[0].modules.find((entry) => entry && entry.id === id) ??
  indexes[1].modules.find((entry) => entry && entry.id === id) ??
  null;

const name = existing?.name ?? manifest.label ?? id;
const description = existing?.description ?? manifest.description ?? name;
const repoUrl = existing?.repoUrl ?? manifest.repository ?? `${GITHUB_BASE}/${id}`;
const category = options.category ?? existing?.category ?? "academics";
const tags =
  options.tags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean) ??
  existing?.tags ??
  (Array.isArray(manifest.keywords) ? manifest.keywords.filter((tag) => typeof tag === "string" && tag.trim()) : null) ??
  [id];

if (tags.length === 0) fail("tags 不可為空");

const zipName = `${id}-${version}.zip`;
const zipPath = path.join(ROOT, "releases", zipName);
fs.mkdirSync(path.dirname(zipPath), { recursive: true });
createZip(moduleDir, zipPath);

const zipSize = fs.statSync(zipPath).size;
if (zipSize > MAX_ZIP_BYTES) {
  fail(`release 壓縮檔 ${(zipSize / 1024).toFixed(1)}KB 超過 500KB 上限`);
}
const checksumSha256 = sha256File(zipPath);

const manifestDest = path.join(ROOT, "modules", id, "module.json");
fs.mkdirSync(path.dirname(manifestDest), { recursive: true });
fs.copyFileSync(manifestPath, manifestDest);

const entry = {
  ...(existing ?? {}),
  id,
  name,
  description,
  version,
  latestVersion: version,
  minHostVersion,
  repoUrl,
  downloadUrl: `${RAW_RELEASES_BASE}/${zipName}`,
  checksumSha256,
  category,
  tags,
  releaseNotes,
};

const now = new Date().toISOString();
for (const index of indexes) {
  const position = index.modules.findIndex((item) => item && item.id === id);
  if (position >= 0) index.modules[position] = entry;
  else index.modules.push(entry);
  index.generatedAt = now;
}
writeJson(indexFiles[0], indexes[0]);
writeJson(indexFiles[1], indexes[1]);

const today = now.slice(0, 10);
const notesText = `${id} v${version}（${today}）\n\n${releaseNotes.map((note) => `- ${note}`).join("\n")}\n`;
fs.writeFileSync(path.join(ROOT, "releases", "notes.txt"), notesText, "utf-8");

if (options.validate) {
  run(process.execPath, [path.join(ROOT, "scripts", "validate-marketplace-index.mjs")], {
    env: { ...process.env, SKIP_REMOTE_CHECK: "1" },
    stdio: "inherit",
  });
}

const commitMessage = `release: publish ${id} v${version}`;
const filesToCommit = [
  "index.json",
  "site/index.json",
  `modules/${id}/module.json`,
  `releases/${zipName}`,
  "releases/notes.txt",
];

if (options.commit) {
  git(["add", "--", ...filesToCommit]);
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT });
  if (staged.status === 0) {
    console.log("[publish] 沒有變更需要 commit。");
  } else {
    git(["commit", "-m", commitMessage]);
    console.log(`[publish] 已 commit：${commitMessage}`);
  }
  if (options.push) {
    git(["push"]);
    console.log("[publish] 已 push。");
  }
}

console.log(`[publish] ${id} v${version}`);
console.log(`[publish] release：releases/${zipName}（${(zipSize / 1024).toFixed(1)}KB）`);
console.log(`[publish] releaseNotes：${releaseNotes.length} 點`);
for (const note of releaseNotes) console.log(`  - ${note}`);
if (!options.commit) console.log("[publish] 未 commit（--no-commit）。");
