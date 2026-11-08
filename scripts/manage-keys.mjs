#!/usr/bin/env node
/**
 * 作者公鑰信任清單管理（C）。
 *
 * 用法：
 *   node scripts/manage-keys.mjs validate [--file keys.json]
 *   node scripts/manage-keys.mjs list
 *   node scripts/manage-keys.mjs add --author <名稱> --public-key <base64> [--repos owner/repo,...] [--note ...]
 *   node scripts/manage-keys.mjs revoke --key-id sha256:... [--author <名稱>]
 *   node scripts/manage-keys.mjs rotate --author <名稱> --public-key <base64> [--revoke-old]
 *   node scripts/manage-keys.mjs affected --key-id sha256:...
 *   node scripts/manage-keys.mjs export-trust [--pretty] [--include-experimental]
 *
 * 所有變更預設直接寫回 keys.json；加 --dry-run 只印結果。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  addKey,
  affectedModules,
  buildTrustMap,
  defaultKeysPath,
  keyIdOf,
  loadKeysFile,
  revokeKey,
  rotateKey,
  saveKeysFile,
  validateKeysData,
} from "./lib/trusted-keys.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`[manage-keys] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function loadIndex() {
  const file = path.join(ROOT, "index.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8").replace(/^﻿/, ""));
}

function authorOfModule(moduleId) {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "modules", moduleId, "module.json"), "utf-8").replace(/^﻿/, "")
    );
    return typeof raw?.author?.author === "string" ? raw.author.author : "";
  } catch {
    return "";
  }
}

function printAffected(index, publicKey) {
  const affected = affectedModules(index, publicKey);
  if (affected.length === 0) {
    console.log("[manage-keys] 目前沒有已上架模組使用這把公鑰。");
    return;
  }
  console.log("[manage-keys] 使用這把公鑰的已上架模組（撤銷後 CI 會失敗，需重新簽章或下架）：");
  for (const item of affected) console.log(`  - ${item.id}（status=${item.status}）`);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "";
  const options = parseArgs(argv.slice(1));
  const file = options.file ? path.resolve(options.file) : defaultKeysPath(ROOT);

  if (!command || command === "help" || options.help) {
    console.log(
      [
        "用法：node scripts/manage-keys.mjs <validate|list|add|revoke|rotate|affected|export-trust> [選項]",
        "  add      --author <名稱> --public-key <base64> [--repos owner/repo,...] [--note ...]",
        "  revoke   --key-id sha256:... [--author <名稱>]",
        "  rotate   --author <名稱> --public-key <base64> [--revoke-old]",
        "  affected --key-id sha256:...",
        "  export-trust [--pretty] [--include-experimental]",
        "共同選項：--file <keys.json>、--dry-run",
      ].join("\n")
    );
    return;
  }

  if (command === "validate") {
    const data = loadKeysFile(file);
    const active = data.keys.filter((item) => item.status === "active").length;
    console.log(
      `[manage-keys] OK：${data.keys.length} 把公鑰（active ${active}、revoked ${
        data.keys.length - active
      }）`
    );
    return;
  }

  const data = loadKeysFile(file);

  if (command === "list") {
    for (const key of data.keys) {
      console.log(
        `${key.status === "active" ? "✔" : "✘"} ${key.author}  ${key.keyId}  ${key.note ?? ""}`.trim()
      );
    }
    return;
  }

  if (command === "add") {
    if (!options.author || !options["public-key"]) fail("add 需要 --author 與 --public-key");
    const entry = addKey(data, {
      author: options.author,
      publicKey: options["public-key"],
      repos: typeof options.repos === "string" ? options.repos : undefined,
      note: typeof options.note === "string" ? options.note : undefined,
    });
    if (!options["dry-run"]) saveKeysFile(file, data);
    console.log(`[manage-keys] 已新增 active 公鑰：${entry.author}（${entry.keyId}）`);
    return;
  }

  if (command === "revoke") {
    if (!options["key-id"]) fail("revoke 需要 --key-id");
    const revoked = revokeKey(data, {
      keyId: options["key-id"],
      author: typeof options.author === "string" ? options.author : undefined,
    });
    if (!options["dry-run"]) saveKeysFile(file, data);
    for (const entry of revoked) {
      console.log(`[manage-keys] 已撤銷：${entry.author}（${entry.keyId}）`);
    }
    const index = loadIndex();
    if (index) printAffected(index, revoked[0].publicKey);
    return;
  }

  if (command === "rotate") {
    if (!options.author || !options["public-key"]) {
      fail("rotate 需要 --author 與 --public-key");
    }
    const result = rotateKey(data, {
      author: options.author,
      publicKey: options["public-key"],
      repos: typeof options.repos === "string" ? options.repos : undefined,
      note: typeof options.note === "string" ? options.note : undefined,
      revokeOld: options["revoke-old"] === true,
    });
    if (!options["dry-run"]) saveKeysFile(file, data);
    console.log(`[manage-keys] 已新增：${result.added.author}（${result.added.keyId}）`);
    if (result.revoked.length === 0) {
      console.log(
        "[manage-keys] 舊金鑰仍為 active（重疊期）。重新簽章所有模組後，再執行 revoke 撤銷舊金鑰。"
      );
    } else {
      for (const entry of result.revoked) {
        console.log(`[manage-keys] 已撤銷舊金鑰：${entry.keyId}`);
      }
    }
    return;
  }

  if (command === "affected") {
    if (!options["key-id"]) fail("affected 需要 --key-id");
    const matches = data.keys.filter((item) => item.keyId === options["key-id"]);
    if (matches.length === 0) fail(`找不到 keyId：${options["key-id"]}`);
    const publicKey = matches[0].publicKey;
    printAffected(loadIndex(), publicKey);
    return;
  }

  if (command === "export-trust") {
    const index = loadIndex();
    if (!index) fail("找不到 index.json");
    const modules = (Array.isArray(index.modules) ? index.modules : []).map((mod) => ({
      ...mod,
      author: authorOfModule(mod.id),
    }));
    const map = buildTrustMap(data.keys, modules, {
      includeExperimental: options["include-experimental"] === true,
    });
    const json = options.pretty ? JSON.stringify(map, null, 2) : JSON.stringify(map);
    console.log(json);
    return;
  }

  fail(`未知指令：${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

export { validateKeysData, keyIdOf };
