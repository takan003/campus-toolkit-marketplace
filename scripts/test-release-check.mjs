/**
 * 發布前 release 檢查測試（P1）。
 * 覆蓋必要目錄、機密檔偵測（.env 可留 example/sample/template）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertNoSensitiveFiles,
  assertRequiredModulePaths,
  isSensitiveFile,
} from "./lib/release-check.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-check-test-"));
try {
  for (const dir of ["admin", "student", "api", "components", "lib", "types"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "module.json"), JSON.stringify({ value: "demo" }), "utf8");
  assertRequiredModulePaths(root);

  fs.rmSync(path.join(root, "types"), { recursive: true, force: true });
  assert.throws(() => assertRequiredModulePaths(root), /types/);
  fs.mkdirSync(path.join(root, "types"));

  fs.writeFileSync(path.join(root, ".env.example"), "A=1\n", "utf8");
  assertNoSensitiveFiles(root);

  fs.writeFileSync(path.join(root, ".env"), "SECRET=1\n", "utf8");
  assert.throws(() => assertNoSensitiveFiles(root), /\.env/);
  fs.rmSync(path.join(root, ".env"));

  fs.writeFileSync(path.join(root, "deploy.key"), "secret\n", "utf8");
  assert.throws(() => assertNoSensitiveFiles(root), /deploy\.key/);
  fs.rmSync(path.join(root, "deploy.key"));

  assert.equal(isSensitiveFile(".env.local"), true);
  assert.equal(isSensitiveFile(".env.production"), true);
  assert.equal(isSensitiveFile(".env.example"), false);
  assert.equal(isSensitiveFile("nested/.env.sample"), false);
  assert.equal(isSensitiveFile("id_ed25519"), true);
  assert.equal(isSensitiveFile("cert.pem"), true);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("[release-check] 必要目錄與機密檔偵測全部通過\n");
