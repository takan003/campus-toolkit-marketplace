import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadKeysFile } from "./lib/trusted-keys.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ENTRY_FIELDS = [
  "id",
  "name",
  "description",
  "status",
  "version",
  "latestVersion",
  "minHostVersion",
  "repoUrl",
  "downloadUrl",
  "checksumSha256",
  "category",
  "tags",
];
const REQUIRED_PACKAGE_PATHS = ["module.json", "admin/", "student/", "api/", "components/", "lib/", "types/"];

function fail(message) {
  throw new Error(message);
}

function readJson(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`缺少檔案：${relativePath}`);
  }
  const text = fs.readFileSync(fullPath, "utf-8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertSemver(value, fieldName) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(value)) {
    fail(`${fieldName} 必須為版本格式（x.y 或 x.y.z），實得：${value}`);
  }
}

function assertEntryShape(entry, indexName) {
  if (!entry || typeof entry !== "object") {
    fail(`${indexName} modules[] 內含非物件資料`);
  }
  for (const key of REQUIRED_ENTRY_FIELDS) {
    if (!(key in entry)) {
      fail(`${indexName} 缺少欄位：modules[].${key}`);
    }
  }
  for (const key of REQUIRED_ENTRY_FIELDS.filter((field) => field !== "tags")) {
    if (typeof entry[key] !== "string" || entry[key].trim().length === 0) {
      fail(`${indexName} 欄位 modules[].${key} 必須為非空字串`);
    }
  }
  if (!Array.isArray(entry.tags) || entry.tags.length === 0 || entry.tags.some((tag) => typeof tag !== "string")) {
    fail(`${indexName} 欄位 modules[].tags 必須為非空字串陣列`);
  }
  if ("releaseNotes" in entry) {
    if (
      !Array.isArray(entry.releaseNotes) ||
      entry.releaseNotes.length === 0 ||
      entry.releaseNotes.length > 3 ||
      entry.releaseNotes.some((note) => typeof note !== "string" || note.trim().length === 0)
    ) {
      fail(`${indexName} 欄位 modules[].releaseNotes 必須為 1–3 點非空字串陣列`);
    }
  }
  if (!["official", "reviewed", "experimental"].includes(entry.status)) {
    fail(`${indexName} modules[].status 需為 official／reviewed／experimental`);
  }
  assertSemver(entry.version, `${indexName} modules[].version`);
  assertSemver(entry.latestVersion, `${indexName} modules[].latestVersion`);
  assertSemver(entry.minHostVersion, `${indexName} modules[].minHostVersion`);
  if (!/^[0-9a-f]{64}$/.test(entry.checksumSha256)) {
    fail(`${indexName} modules[].checksumSha256 必須為 64 碼小寫十六進位`);
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertSafeZipEntries(entries) {
  for (const entry of entries) {
    const normalized = String(entry).replace(/\\/g, "/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
      fail(`ZIP 含非法絕對路徑：${entry}`);
    }
    if (normalized.split("/").filter(Boolean).some((segment) => segment === "..")) {
      fail(`ZIP 含路徑穿越（zip slip）：${entry}`);
    }
  }
}

function listZipEntries(zipPath) {
  // Node 無內建 zip reader；Windows 用 .NET ZipFile 只列項目（不解壓），
  // 避免惡意 zip 在驗證階段就寫出暫存目錄之外。
  if (process.platform === "win32") {
    const quoted = zipPath.replace(/'/g, "''");
    const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${quoted}'); $z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()`;
    const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      fail(`ZIP 檢查失敗：${result.stderr || result.stdout}`);
    }
    const entries = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
    assertSafeZipEntries(entries);
    return entries;
  }
  const result = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf-8" });
  if (result.status !== 0) {
    fail(`ZIP 檢查失敗：${result.stderr || result.stdout}`);
  }
  const entries = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  assertSafeZipEntries(entries);
  return entries;
}

async function verifyDownloadUrlReachable(url) {
  if (process.env.SKIP_REMOTE_CHECK === "1") return;
  const response = await fetch(url, { method: "HEAD" });
  if (response.ok) return;

  const fallback = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  if (!fallback.ok) {
    fail(`downloadUrl 無法存取（${fallback.status}）：${url}`);
  }
}

function resolveRepoReleaseFile(downloadUrl) {
  const url = new URL(downloadUrl);
  const expectedPrefix = "/takan003/campus-toolkit-marketplace/main/releases/";
  if (url.hostname !== "raw.githubusercontent.com" || !url.pathname.startsWith(expectedPrefix)) {
    return null;
  }
  return path.join(ROOT, "releases", url.pathname.slice(expectedPrefix.length));
}

function hasRequiredDirectory(entries, requiredDir) {
  const dirName = requiredDir.replace(/\/$/, "");
  const marker = `/${dirName}/`;
  return entries.some((name) => {
    const normalized = name.replace(/\\/g, "/");
    return (
      normalized === dirName ||
      normalized.startsWith(`${dirName}/`) ||
      normalized.includes(marker) ||
      normalized.endsWith(`/${dirName}`)
    );
  });
}

/** C 的作者公鑰信任清單（keys.json；格式由 trusted-keys 驗證） */
function loadTrustedKeys() {
  return loadKeysFile(path.join(ROOT, "keys.json")).keys;
}

/**
 * reviewed 必須有簽章；有簽章時驗證：
 *   1. 公鑰必須在 keys.json 且作者相符、狀態非 revoked
 *   2. publicKey 必須是釘選公鑰
 *   3. 簽章必須對當前 release zip 的 sha256 成立
 */
function verifyEntrySignature(entry, manifest, digest) {
  const hasSignature = Boolean(entry.signature && entry.publicKey);
  if (entry.status === "reviewed" && !hasSignature) {
    fail(`${entry.id} status=reviewed 需提供 signature 與 publicKey`);
    return;
  }
  if (!hasSignature) return;

  const author = manifest && manifest.author && typeof manifest.author.author === "string" ? manifest.author.author : "";
  const trusted = loadTrustedKeys().filter(
    (key) => key.author === author && key.status !== "revoked"
  );
  if (trusted.length === 0) {
    fail(`${entry.id}：作者「${author}」沒有 C 的 active 公鑰，或公鑰已被撤銷`);
    return;
  }

  const pinned = trusted.some((key) => {
    try {
      return Buffer.from(key.publicKey, "base64").equals(Buffer.from(entry.publicKey, "base64"));
    } catch {
      return false;
    }
  });
  if (!pinned) {
    fail(`${entry.id}：publicKey 不在 C 的作者公鑰信任清單`);
    return;
  }

  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(entry.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const valid = crypto.verify(
      null,
      Buffer.from(digest, "hex"),
      key,
      Buffer.from(entry.signature, "base64")
    );
    if (!valid) fail(`${entry.id}：簽章驗證失敗（zip 與簽章不符）`);
  } catch {
    fail(`${entry.id}：簽章或公鑰格式錯誤`);
  }
}

async function validate() {
  try {
    loadKeysFile(path.join(ROOT, "keys.json"));
  } catch (error) {
    fail(`keys.json 無效：${error instanceof Error ? error.message : String(error)}`);
  }

  const rootIndex = readJson("index.json");
  const siteIndex = readJson("site/index.json");
  for (const [name, index] of [
    ["index.json", rootIndex],
    ["site/index.json", siteIndex],
  ]) {
    if (!index || typeof index !== "object" || !Array.isArray(index.modules)) {
      fail(`${name} 必須包含 modules 陣列`);
    }
    index.modules.forEach((entry) => assertEntryShape(entry, name));
  }

  const rootModulesJson = JSON.stringify(rootIndex.modules);
  const siteModulesJson = JSON.stringify(siteIndex.modules);
  if (rootModulesJson !== siteModulesJson) {
    fail("index.json 與 site/index.json 的 modules[] 必須一致");
  }

  for (const entry of rootIndex.modules) {
    const moduleManifestPath = path.join(ROOT, "modules", entry.id, "module.json");
    if (!fs.existsSync(moduleManifestPath)) {
      fail(`缺少模組 metadata：modules/${entry.id}/module.json`);
    }
    const manifest = readJson(path.relative(ROOT, moduleManifestPath));
    if (manifest.value !== entry.id) {
      fail(`modules/${entry.id}/module.json 的 value 與 index id 不一致`);
    }
    if (manifest.minHostVersion !== entry.minHostVersion) {
      fail(`modules/${entry.id}/module.json 的 minHostVersion 與 index 不一致`);
    }
    const manifestVersion =
      manifest && manifest.author && typeof manifest.author.version === "string" ? manifest.author.version : null;
    if (manifestVersion !== entry.version) {
      fail(`modules/${entry.id}/module.json 的 author.version（${manifestVersion}）與 index.version（${entry.version}）不一致`);
    }

    await verifyDownloadUrlReachable(entry.downloadUrl);

    const localRelease = resolveRepoReleaseFile(entry.downloadUrl);
    if (!localRelease) {
      continue;
    }
    if (!fs.existsSync(localRelease)) {
      fail(`downloadUrl 指向的 release 檔不存在：${localRelease}`);
    }

    const digest = sha256File(localRelease);
    if (digest !== entry.checksumSha256) {
      fail(`checksumSha256 不一致：${entry.id}`);
    }
    verifyEntrySignature(entry, manifest, digest);

    const entries = listZipEntries(localRelease);
    for (const required of REQUIRED_PACKAGE_PATHS) {
      if (required.endsWith("/")) {
        if (!hasRequiredDirectory(entries, required)) {
          fail(`${entry.id} 的發布包缺少必要目錄：${required}`);
        }
      } else if (!entries.some((name) => name.endsWith(required))) {
        fail(`${entry.id} 的發布包缺少必要檔案：${required}`);
      }
    }
  }
}

validate()
  .then(() => {
    process.stdout.write("Marketplace index validation passed.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
