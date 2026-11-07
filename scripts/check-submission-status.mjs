/**
 * Fork PR 的投稿只能送 experimental。
 *
 * 投稿者可以提出模組，但不能自己把狀態改成 official／reviewed；
 * 這兩個狀態要在維護者審核後，由上游分支變更或由維護者提交。
 */
import fs from "node:fs";

const isForkPr = process.env.HEAD_REPO_FORK === "true";
if (!isForkPr) {
  console.log("[submission] 非 fork PR，略過狀態限制。");
  process.exit(0);
}

const index = JSON.parse(fs.readFileSync("index.json", "utf-8").replace(/^\uFEFF/, ""));
const modules = Array.isArray(index.modules) ? index.modules : [];
const invalid = modules.filter((item) => item && item.status !== "experimental");

if (invalid.length > 0) {
  console.error(
    `[submission] fork PR 只能提交 status=experimental；以下模組狀態不合格：${invalid
      .map((item) => `${item.id}=${item.status}`)
      .join("、")}`
  );
  process.exit(1);
}

console.log(`[submission] fork PR 狀態檢查通過：${modules.length} 個模組皆為 experimental。`);
