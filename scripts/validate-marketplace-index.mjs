import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ENTRY_FIELDS = [
  "id",
  "name",
  "description",
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

function listZipEntries(zipPath) {
  // Node 無內建 zip reader，改呼叫 powershell 的 Expand-Archive 對 CI 與 Windows 都可用。
  // 在 GitHub Actions ubuntu runner 會走 unzip 指令。
  if (process.platform === "win32") {
    const tempDir = fs.mkdtempSync(path.join(ROOT, ".tmp-market-zip-"));
    const command = `Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force`;
    const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fail(`ZIP 解壓失敗：${result.stderr || result.stdout}`);
    }
    const entries = [];
    const walk = (dir, base) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = path.relative(base, full).split(path.sep).join("/");
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          entries.push(`${rel}/`);
          walk(full, base);
        } else {
          entries.push(rel);
        }
      }
    };
    walk(tempDir, tempDir);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return entries.sort();
  }
  const result = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf-8" });
  if (result.status !== 0) {
    fail(`ZIP 檢查失敗：${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
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

async function validate() {
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
