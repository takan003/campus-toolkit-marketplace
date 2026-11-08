/**
 * 作者公鑰信任清單測試（C）。
 * 覆蓋：keyId 計算、ed25519 驗證、重複登記、撤銷、輪替、trust map 與受影響模組。
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  addKey,
  affectedModules,
  buildTrustMap,
  keyIdOf,
  normalizeKeyEntry,
  revokeKey,
  rotateKey,
  validateKeysData,
} from "./lib/trusted-keys.mjs";

const keyA = crypto.generateKeyPairSync("ed25519");
const keyB = crypto.generateKeyPairSync("ed25519");
const keyC = crypto.generateKeyPairSync("ed25519");
const pubA = keyA.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const pubB = keyB.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const pubC = keyC.publicKey.export({ type: "spki", format: "der" }).toString("base64");

assert.match(keyIdOf(pubA), /^sha256:[0-9a-f]{64}$/);
assert.throws(() => normalizeKeyEntry({ author: "x", publicKey: "not-base64", status: "active" }));

const x25519 = crypto.generateKeyPairSync("x25519");
const x25519Pub = x25519.publicKey.export({ type: "spki", format: "der" }).toString("base64");
assert.throws(
  () => normalizeKeyEntry({ author: "x", publicKey: x25519Pub, status: "active" }),
  /ed25519/
);

const data = { keys: [] };
const entryA = addKey(data, { author: "alice", publicKey: pubA, repos: "alice/plugin" });
assert.equal(entryA.keyId, keyIdOf(pubA));
assert.equal(entryA.status, "active");
assert.throws(() => addKey(data, { author: "alice", publicKey: pubA }), /已登記/);

// 同一把金鑰可登記在不同作者下（官方 key 目前就是如此）
const entryOfficialB = addKey(data, { author: "bob", publicKey: pubA });
assert.equal(entryOfficialB.keyId, entryA.keyId);

const revoked = revokeKey(data, { keyId: entryA.keyId, author: "alice" });
assert.equal(revoked.length, 1);
assert.equal(revoked[0].status, "revoked");
assert.throws(() => revokeKey(data, { keyId: entryA.keyId }), /多位作者/);

const rotation = rotateKey(data, {
  author: "alice",
  publicKey: pubB,
  revokeOld: false,
});
assert.equal(rotation.added.status, "active");
assert.equal(rotation.revoked.length, 0, "預設重疊期不撤銷舊金鑰");
const rotation2 = rotateKey(data, {
  author: "alice",
  publicKey: pubC,
  revokeOld: true,
});
assert.ok(rotation2.revoked.length >= 1, "revokeOld 應撤銷其他 active 金鑰");

const validated = validateKeysData(data);
assert.equal(validated.keys.length, 4);
assert.throws(
  () =>
    validateKeysData({
      keys: [
        { author: "alice", publicKey: pubA, status: "active" },
        { author: "alice", publicKey: pubA, status: "active" },
      ],
    }),
  /重複登記/
);
assert.throws(
  () =>
    validateKeysData({
      keys: [{ author: "alice", publicKey: pubA, status: "active", keyId: "sha256:deadbeef" }],
    }),
  /keyId 與公鑰不符/
);

const index = {
  modules: [
    { id: "m1", status: "reviewed", publicKey: pubC, signature: "sig" },
    { id: "m2", status: "reviewed", publicKey: pubA, signature: "sig" },
    { id: "m3", status: "experimental", publicKey: pubC, signature: "sig" },
  ],
};
const modules = [
  { id: "m1", author: "alice", status: "reviewed", publicKey: pubC, signature: "sig" },
  { id: "m2", author: "bob", status: "reviewed", publicKey: pubA, signature: "sig" },
  { id: "m3", author: "alice", status: "experimental", publicKey: pubC, signature: "sig" },
];
const map = buildTrustMap(validated.keys, modules);
assert.deepEqual(map, { m1: [pubC], m2: [pubA] }, "只收 official／reviewed 的 active 公鑰");
assert.throws(
  () =>
    buildTrustMap(validated.keys, [
      { id: "bad", author: "alice", status: "reviewed", publicKey: pubA, signature: "sig" },
    ]),
  /不是 active/
);

assert.deepEqual(affectedModules(index, pubC), [
  { id: "m1", status: "reviewed" },
  { id: "m3", status: "experimental" },
]);

process.stdout.write(
  "[trusted-keys] keyId、ed25519、重複、撤銷、輪替、trust map 與受影響模組全部通過\n"
);
