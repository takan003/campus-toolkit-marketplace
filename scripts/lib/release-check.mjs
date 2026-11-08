/**
 * C 發布前的 release 檢查（P1）。
 * 提供：必要目錄檢查、敏感檔檢查、zip 解壓後內容比對。
 * 不依賴外部套件；Windows 用 PowerShell Expand-Archive，其他平台用 unzip。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REQUIRED_MODULE_PATHS = [
  "module.json",
  "admin",
  "student",
  "api",
  "components",
  "lib",
  "types",
];

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const FORBIDDEN_ZIP_SEGMENTS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const SECRET_SUFFIXES = [".key", ".pem", ".p12", ".pfx", ".jks", ".keystore"];
const SECRET_NAMES = new Set(["id_rsa", "id_ed25519", ".npmrc", ".netrc"]);

function fail(message) {
  throw new Error(message);
}

function walk(root, relative = "", out = []) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** `.env` 可以留 `.env.example`／`.env.sample`／`.env.template`，其餘 `.env*` 一律視為機密 */
export function isSensitiveFile(relPath) {
  const base = path.basename(relPath);
  if (base === ".env") return true;
  if (base.startsWith(".env.")) {
    return !["example", "sample", "template"].includes(base.slice(5));
  }
  if (SECRET_NAMES.has(base)) return true;
  return SECRET_SUFFIXES.some((suffix) => base.toLowerCase().endsWith(suffix));
}

/** 在來源資料夾檢查必要目錄（不掃 node_modules／.git） */
export function assertRequiredModulePaths(moduleDir) {
  for (const rel of REQUIRED_MODULE_PATHS) {
    const full = path.join(moduleDir, rel);
    if (!fs.existsSync(full)) {
      fail(`模組缺少必要路徑：${rel}`);
    }
    if (rel !== "module.json" && !fs.statSync(full).isDirectory()) {
      fail(`模組的 ${rel} 必須是資料夾`);
    }
  }
}

/** 來源資料夾不得含機密檔（會被打包進 release） */
export function assertNoSensitiveFiles(moduleDir) {
  const hits = walk(moduleDir).filter(isSensitiveFile);
  if (hits.length > 0) {
    fail(`模組內含機密檔，拒絕打包：${hits.join("、")}`);
  }
}

/** 解壓 zip 到指定資料夾 */
export function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { encoding: "utf-8" }
    );
    if (result.status !== 0) {
      fail(`ZIP 解壓失敗：${(result.stderr || result.stdout || "").trim()}`);
    }
    return;
  }
  const result = spawnSync("unzip", ["-q", zipPath, "-d", destDir], { encoding: "utf-8" });
  if (result.status !== 0) {
    fail(`ZIP 解壓失敗：${(result.stderr || result.stdout || "").trim()}`);
  }
}

function assertZipHasNoForbiddenPaths(root) {
  const hits = walk(root).filter((rel) => {
    const segments = rel.split("/");
    return segments.some((segment) => FORBIDDEN_ZIP_SEGMENTS.has(segment));
  });
  if (hits.length > 0) {
    fail(`release zip 含不該打包的目錄／檔案：${hits.join("、")}`);
  }
}

/**
 * 解壓後驗證：
 * 1. 必要路徑存在
 * 2. 沒有 node_modules／.git／.next／dist／build
 * 3. 沒有機密檔
 * 4. module.json 與來源完全相同
 */
export function verifyZipArchive(zipPath, sourceDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "campus-market-verify-"));
  try {
    extractZip(zipPath, tempDir);
    assertRequiredModulePaths(tempDir);
    assertZipHasNoForbiddenPaths(tempDir);
    const sensitive = walk(tempDir).filter(isSensitiveFile);
    if (sensitive.length > 0) {
      fail(`release zip 含機密檔：${sensitive.join("、")}`);
    }

    const sourceManifest = fs
      .readFileSync(path.join(sourceDir, "module.json"), "utf-8")
      .replace(/^\uFEFF/, "");
    const zipManifest = fs
      .readFileSync(path.join(tempDir, "module.json"), "utf-8")
      .replace(/^\uFEFF/, "");
    if (JSON.stringify(JSON.parse(sourceManifest)) !== JSON.stringify(JSON.parse(zipManifest))) {
      fail("release zip 內的 module.json 與來源不一致");
    }

    return { files: walk(tempDir).length };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
