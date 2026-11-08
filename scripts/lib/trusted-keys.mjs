/**
 * C 的作者公鑰信任清單工具（純函式）。
 * 供 `scripts/manage-keys.mjs` 與 `scripts/validate-marketplace-index.mjs` 共用。
 *
 * 公鑰格式：ed25519 SPKI DER 的 base64（與 A `module-sign.mjs` 相同）。
 * keyId 一律由公鑰 sha256 計算，不接受手動指定，避免作者／金鑰錯配。
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const KEY_STATUSES = ["active", "revoked"];
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 公鑰 → `sha256:<hex>` */
export function keyIdOf(publicKey) {
  return `sha256:${crypto.createHash("sha256").update(Buffer.from(publicKey, "base64")).digest("hex")}`;
}

/** 驗證 ed25519 SPKI 公鑰；回傳正規化 base64，失敗丟錯 */
export function normalizePublicKey(publicKey) {
  if (typeof publicKey !== "string" || publicKey.trim() === "") {
    throw new Error("publicKey 不可為空");
  }
  const value = publicKey.trim();
  let key;
  try {
    key = crypto.createPublicKey({
      key: Buffer.from(value, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new Error("publicKey 不是合法的 base64 SPKI 公鑰");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`publicKey 必須是 ed25519（實得 ${key.asymmetricKeyType ?? "unknown"}）`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} 必須是字串`);
  return value.trim();
}

/** 正規化並驗證一筆 key entry */
export function normalizeKeyEntry(entry) {
  if (!entry || typeof entry !== "object") throw new Error("keys[] 每筆必須是物件");
  const author = optionalString(entry.author, "author");
  if (!author) throw new Error("keys[].author 不可為空");

  const publicKey = normalizePublicKey(entry.publicKey);
  const expectedKeyId = keyIdOf(publicKey);
  if (entry.keyId !== undefined && entry.keyId !== expectedKeyId) {
    throw new Error(
      `keys[].keyId 與公鑰不符（author=${author}）：宣告 ${entry.keyId}，實際 ${expectedKeyId}`
    );
  }
  if (!KEY_STATUSES.includes(entry.status)) {
    throw new Error(`keys[].status 需為 active／revoked（author=${author}）`);
  }
  if (entry.addedAt !== undefined && !DATE_RE.test(String(entry.addedAt))) {
    throw new Error(`keys[].addedAt 需為 YYYY-MM-DD（author=${author}）`);
  }
  if (entry.repos !== undefined) {
    if (
      !Array.isArray(entry.repos) ||
      entry.repos.some((repo) => typeof repo !== "string" || !REPO_RE.test(repo))
    ) {
      throw new Error(`keys[].repos 需為 owner/repo 字串陣列（author=${author}）`);
    }
  }

  return {
    author,
    keyId: expectedKeyId,
    publicKey,
    status: entry.status,
    ...(entry.addedAt ? { addedAt: entry.addedAt } : {}),
    ...(entry.note ? { note: String(entry.note) } : {}),
    ...(entry.repos ? { repos: [...entry.repos] } : {}),
  };
}

/** 驗證整份 keys.json 資料；回傳正規化結果 */
export function validateKeysData(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.keys)) {
    throw new Error("keys.json 需為 { keys: [...] }");
  }
  const keys = data.keys.map(normalizeKeyEntry);
  const seen = new Set();
  for (const key of keys) {
    const id = `${key.author}\u0000${key.publicKey}`;
    if (seen.has(id)) {
      throw new Error(`keys.json 重複登記同一作者的同一把公鑰：${key.author}`);
    }
    seen.add(id);
  }
  return { keys };
}

export function loadKeysFile(file) {
  const raw = fs.readFileSync(file, "utf-8").replace(/^﻿/, "");
  return validateKeysData(JSON.parse(raw));
}

export function saveKeysFile(file, data) {
  fs.writeFileSync(file, `${JSON.stringify({ keys: data.keys }, null, 2)}\n`, "utf-8");
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/** 新增 active 公鑰；同一作者同一把金鑰重複登記即拒絕 */
export function addKey(data, input) {
  const author = optionalString(input.author, "author");
  if (!author) throw new Error("--author 不可為空");
  const publicKey = normalizePublicKey(input.publicKey);
  const keyId = keyIdOf(publicKey);

  const duplicate = data.keys.find(
    (item) => item.author === author && item.publicKey === publicKey
  );
  if (duplicate) {
    throw new Error(
      `作者「${author}」已登記這把公鑰（status=${duplicate.status}，keyId=${duplicate.keyId}）`
    );
  }

  const repos = input.repos
    ? input.repos.split(",").map((item) => item.trim()).filter(Boolean)
    : undefined;
  if (repos && repos.some((repo) => !REPO_RE.test(repo))) {
    throw new Error("--repos 需為逗號分隔的 owner/repo");
  }

  const entry = normalizeKeyEntry({
    author,
    publicKey,
    status: "active",
    addedAt: input.addedAt || todayString(),
    note: input.note,
    repos,
  });
  data.keys.push(entry);
  return entry;
}

/**
 * 撤銷公鑰。
 * 同一把金鑰可能登記在多個作者下（官方 key 目前就是），
 * 因此 keyId 命中多筆時必須指定 --author，避免誤撤銷。
 */
export function revokeKey(data, input) {
  const keyId = optionalString(input.keyId, "keyId");
  const author = optionalString(input.author, "author");
  if (!keyId) throw new Error("--key-id 不可為空");
  let matches = data.keys.filter((item) => item.keyId === keyId);
  if (author) matches = matches.filter((item) => item.author === author);
  if (matches.length === 0) throw new Error(`找不到符合的 active／revoked 公鑰：${keyId}`);
  if (matches.length > 1 && !author) {
    throw new Error(
      `keyId ${keyId} 對應多位作者（${matches.map((item) => item.author).join("、")}）——請加 --author`
    );
  }
  for (const entry of matches) entry.status = "revoked";
  return matches;
}

/** 輪替：新增新金鑰；可選擇立即撤銷同作者其他 active 金鑰 */
export function rotateKey(data, input) {
  const author = optionalString(input.author, "author");
  if (!author) throw new Error("--author 不可為空");
  const added = addKey(data, input);
  const revoked = [];
  if (input.revokeOld) {
    for (const entry of data.keys) {
      if (entry.author === author && entry.publicKey !== added.publicKey && entry.status === "active") {
        entry.status = "revoked";
        revoked.push(entry);
      }
    }
  }
  return { added, revoked };
}

/** 依 index 內容找出使用某把公鑰的模組 */
export function affectedModules(indexData, publicKey) {
  const modules = Array.isArray(indexData?.modules) ? indexData.modules : [];
  return modules
    .filter((mod) => mod && mod.publicKey === publicKey)
    .map((mod) => ({ id: String(mod.id ?? ""), status: String(mod.status ?? "") }));
}

/**
 * 產生主程式 `MODULE_MARKET_TRUSTED_KEYS` 的 JSON。
 * 只收錄 official／reviewed 且簽章公鑰仍為 active 的模組；
 * 任何已簽章模組使用 revoked／未登記金鑰都會丟錯（fail-closed）。
 */
export function buildTrustMap(keys, modules, options = {}) {
  const active = new Set(
    keys.filter((item) => item.status === "active").map((item) => `${item.author}\u0000${item.publicKey}`)
  );
  const allowedStatuses = options.includeExperimental
    ? ["official", "reviewed", "experimental"]
    : ["official", "reviewed"];
  const map = {};
  for (const mod of modules) {
    if (!mod || !mod.id) continue;
    if (!mod.signature || !mod.publicKey) continue;
    if (!allowedStatuses.includes(mod.status)) continue;
    if (!mod.author) {
      throw new Error(`模組 ${mod.id} 缺少 author，無法比對公鑰信任`);
    }
    if (!active.has(`${mod.author}\u0000${mod.publicKey}`)) {
      throw new Error(
        `模組 ${mod.id} 的簽章公鑰不是 active（author=${mod.author}，keyId=${keyIdOf(mod.publicKey)}）`
      );
    }
    map[mod.id] = [mod.publicKey];
  }
  return map;
}

/** 取得 keys.json 的預設路徑（呼叫端可覆寫） */
export function defaultKeysPath(root) {
  return path.join(root, "keys.json");
}
