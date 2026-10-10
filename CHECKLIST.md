# 外部模組市集實作清單

## 目標

建立一個獨立的外部模組市集 repo，讓主程式只負責讀取、驗證與安裝模組，而不直接承擔市集本體。

## 階段 1：市場 repo 基礎建置

- [ ] 建立 `campus-toolkit-marketplace` repo
- [ ] 建立 `README.md`
- [ ] 建立 `index.json`
- [ ] 建立 `modules/` 目錄
- [ ] 建立 `releases/` 目錄
- [ ] 建立 `.gitignore`

## 階段 2：定義市集 schema

- [ ] 決定 `index.json` 欄位
- [ ] 確認 `modules[]` 結構
- [ ] 定義每個 module 必須的欄位
- [ ] 定義 `version` / `latestVersion` / `minHostVersion`
- [ ] 定義 `downloadUrl` / `checksumSha256`
- [ ] 定義 `category` / `tags`

## 階段 3：建立第一個模組

- [ ] 建立 `modules/examRegistration/`
- [ ] 建立 `modules/examRegistration/module.json`
- [ ] 確認 `value` / `label` / `kind` / `status`
- [ ] 確認 `routes` / `roleHrefs`
- [ ] 確認 `contractVersion` / `minHostVersion`
- [ ] 確認 `author` 資訊

## 階段 4：建立 release asset

- [ ] 打包模組成 zip
- [ ] 命名為 `examRegistration.zip`
- [ ] 上傳到 GitHub Releases 或其他 release storage
- [ ] 取得實際 `downloadUrl`
- [ ] 測試下載 URL 是否可用

## 階段 5：計算 checksum

- [ ] 計算 `sha256`
- [ ] 填入 `checksumSha256`
- [ ] 確認 checksum 與實際檔案一致

## 階段 6：更新市場索引

- [ ] 將模組資料加入 `index.json`
- [ ] 確認 `id`、`name`、`version` 正確
- [ ] 確認 `latestVersion` 正確
- [ ] 確認 `downloadUrl` 正確
- [ ] 確認 `checksumSha256` 正確

## 階段 7：驗證市場索引

- [ ] 直接打開 `index.json` 驗證 JSON 正確
- [ ] 確認模組列表可被讀取
- [ ] 確認 `downloadUrl` 可下載
- [ ] 確認 `minHostVersion` 符合主程式版本

## 階段 8：主程式接入（最小版本）

- [ ] 主程式讀取 `index.json`
- [ ] 解析 `modules[]`
- [ ] 驗證欄位型別
- [ ] 顯示模組列表
- [ ] 安裝按鈕呼叫安裝流程
- [ ] 安裝流程驗證 checksum
- [ ] 寫入 `module.lock.json`

## 階段 9：版本更新流程

- [ ] 比較已安裝版本與市場版本
- [ ] 判斷是否有 update
- [ ] 顯示 update 狀態
- [ ] 實作 upgrade flow
- [ ] 實作 rollback / fail-safe

## 階段 10：安全強化

- [ ] 強制 HTTPS
- [ ] localhost 僅在開發環境使用
- [ ] 驗證下載 checksum
- [ ] 路由衝突檢查
- [ ] 安裝失敗 rollback
- [ ] 版本相容性檢查

## 階段 11：後續擴充

- [ ] 實作 marketplace 首頁
- [ ] 實作發佈流程
- [ ] 增加模組分類頁
- [ ] 加入更新通知
- [ ] 加入審核機制
- [ ] 加入發佈日誌與 changelog

## 第一步要做的最小事項

- [ ] 建立 repo
- [ ] 建立 `index.json`
- [ ] 建立 `modules/examRegistration/module.json`
- [ ] 上傳 release asset
- [ ] 寫入實際 `downloadUrl`
- [ ] 完成 checksum

## 完成定義

當以下條件成立時，這個外部市場 repo 可視為 MVP：

- `index.json` 可被主程式讀取
- 模組 metadata 正確
- release asset 可下載
- 主程式可顯示與安裝模組
- 安裝後寫入 lockfile

這代表外部市集已經從概念化成可執行的最小可用版本。
