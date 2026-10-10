# 外部模組市集架設規劃書

## 1. 目標

建立一個「獨立的外部模組市集」作為模組發佈與索引來源，並讓主程式 `campus-toolkit` 只負責：

- 讀取市集索引
- 驗證模組資訊
- 安裝或更新模組
- 管理模組狀態與 lockfile

不讓主程式直接承擔市集的發佈、版本管理與公開入口本體。

這個設計的核心原則：

- 市集 repo = 發佈與索引來源
- 主程式 repo = 執行環境與管理入口
- 兩者分離，避免互相干擾與合併衝突

## 2. 架構總覽

### 2.1 分工

1. 市集 repo
   - 負責保存 `index.json`
   - 保存每個模組的 metadata
   - 保存 release asset 連結
   - 提供模組版本與升級資訊

2. 主程式 repo
   - 正確讀取 `index.json`
   - 檢查 `minHostVersion`、downloadUrl、checksum
   - 建立安裝流程
   - 產生 `module.lock.json`

### 2.2 資料流

```text
模組開發者
   ↓
模組 repo / release asset
   ↓
外部 marketplace repo
   ↓
index.json (modules metadata)
   ↓
主程式讀取並展示
   ↓
使用者安裝 / 更新模組
```

## 3. 市集 repo 的責任範圍

外部市集 repo 只做三件事：

1. 提供一份公開索引：`index.json`
2. 提供每個模組的 release asset（zip / tar.gz）
3. 記錄版本與相容性資訊

它不負責：

- 主程式執行
- 權限控制
- 角色/功能模組啟用邏輯
- 主程式 runtime 管理

## 4. 建議的 repo 結構

```text
campus-toolkit-marketplace/
├─ index.json
├─ README.md
├─ modules/
│  ├─ examRegistration/
│  │  └─ module.json
│  └─ ...
├─ releases/
│  ├─ notes.txt
│  └─ ...
├─ .gitignore
├─ LICENSE
└─ .github/
   └─ workflows/
```

### 4.1 `index.json` 目標

`index.json` 是市場入口，主程式要讀它。它需要保留：

- generatedAt
- marketplaceVersion
- modules[]

每個模組至少含：

- id
- name
- description
- version
- latestVersion
- minHostVersion
- repoUrl
- downloadUrl
- checksumSha256
- category
- tags

## 5. `index.json` 最小格式

範例：

```json
{
  "generatedAt": "2026-10-10T22:05:00+08:00",
  "marketplaceVersion": "1.0.0",
  "modules": [
    {
      "id": "examRegistration",
      "name": "Exam Registration",
      "description": "Student exam registration and timetable management module.",
      "version": "1.0.0",
      "latestVersion": "1.0.0",
      "minHostVersion": "0.396",
      "repoUrl": "https://github.com/takan003/examRegistration",
      "downloadUrl": "https://github.com/takan003/examRegistration/releases/download/v1.0.0/examRegistration.zip",
      "checksumSha256": "REPLACE_WITH_REAL_SHA256",
      "category": "academics",
      "tags": ["exam", "registration", "student"]
    }
  ]
}
```

## 6. 模組 metadata 範例

每個模組資料夾可放一份 `module.json`，內容包含產品／功能資訊，供市集和主程式共同理解。範例：

```json
{
  "value": "examRegistration",
  "label": "Exam Registration",
  "kind": "optional",
  "status": "live",
  "description": "Student exam registration and timetable management module.",
  "href": "/student/exam-registration",
  "roleHrefs": {
    "student": "/student/exam-registration",
    "staff": "/admin/exam-registration",
    "admin": "/admin/exam-registration"
  },
  "author": {
    "author": "takan003",
    "authorUrl": "https://github.com/takan003",
    "version": "1.0.0",
    "releasedAt": "2026-10-10 22:05"
  },
  "provides": {
    "student": true,
    "parent": false,
    "staff": true,
    "admin": true
  },
  "routes": [
    "/student/exam-registration",
    "/admin/exam-registration"
  ],
  "contractVersion": 1,
  "minHostVersion": "0.396"
}
```

## 7. 建置步驟（逐步執行）

### Step 1：建立外部市場 repo

- 新建目錄：`campus-toolkit-marketplace`
- 初始化 git repo
- 建立 `README.md`
- 建立 `index.json`
- 建立 `modules/` 與 `releases/` 目錄

### Step 2：定義市集 schema

先定義這些欄位：

- `id`
- `name`
- `version`
- `latestVersion`
- `minHostVersion`
- `downloadUrl`
- `checksumSha256`
- `repoUrl`
- `category`
- `tags`

這些都是市場最簡單的索引契約。

### Step 3：新增第一個模組

例如：`examRegistration`

- 建立 `modules/examRegistration/module.json`
- 確認 `value`、`routes`、`minHostVersion` 與 `contractVersion` 正確
- 讓它符合主程式的模組合約

### Step 4：準備 release asset

- 將模組壓縮成 zip
- 例如：`examRegistration.zip`
- 上傳到 GitHub Releases 或靜態檔案庫
- 確認 `downloadUrl` 可真的下載

### Step 5：計算 checksum

- 執行 SHA256 計算
- 填入 `checksumSha256`
- 這是安裝前的安全驗證核心

### Step 6：更新 `index.json`

- 把對應 module 加回 `modules[]`
- 確認 `downloadUrl` 和實際 release asset 一致
- 確認 `version` 與 `latestVersion` 一致

### Step 7：驗證市集索引

- 透過 `curl` 或瀏覽器直接打開 `index.json`
- 確認 JSON 格式正確
- 確認模組清單有 1 個或多個 module

### Step 8：讓主程式抓取市集

在主程式側：

- 加上 `MODULE_MARKET_URL` / `MODULE_MARKET_INDEX_URL`
- 撰寫市場讀取 API（GET）
- 解析 `index.json`
- 驗證型別與欄位

### Step 9：主程式安裝流程

- 讀取模組 `downloadUrl`
- 下載 zip
- 驗證 `checksumSha256`
- 解壓到指定模組路徑
- 執行 `module-cli` 或專屬安裝命令
- 寫入 `module.lock.json`

### Step 10：版本管理

後續再補：

- 已安裝版本 vs 市場最新版本比較
- update / upgrade flow
- 更新前檢查路由衝突
- rollback 機制
- 安裝失敗回滾

## 8. 安全要求

市集模組不應該被視為完全可信任，至少要做到：

- `https` only（必要時允許 localhost）
- `checksumSha256` 必須驗證
- `downloadUrl` 必須是信任來源
- `minHostVersion` 必須符合主程式版本
- 路由衝突檢查
- 安裝失敗自動 rollback
- 只允許該 repo 的正式 release

## 9. 版本策略

各模組至少需要：

- `version`
- `latestVersion`
- `minHostVersion`

建議版本規則：

- 主要版本：breaking change
- 次版本：新功能
- 修訂版本：修 bug

例如：

- `1.0.0`
- `1.1.0`
- `1.1.1`

## 10. 後續擴充方向

在最小版完成後，逐步補：

1. 市場更新檢查
2. 安裝執行狀態 UI
3. update / rollback
4. release changelog
5. marketplace 內審核機制
6. 模組評分 / 標籤 / 類別頁面
7. 公開 marketplace 前端站

## 11. 最小可交付版本（MVP）

MVP 只要求：

- `index.json` 可用
- `module.json` 可用
- `downloadUrl` 可下載
- 主程式可讀取並展示模組
- 主程式可安裝模組

這樣就足以作為第一階段。不要追求完整 marketplace app 一開始就做完。

## 12. 建議實作順序

建議按序實作：

1. 建立市集 repo
2. 建好 `index.json` schema
3. 放入第一個模組
4. 上傳 release asset
5. 驗證 checksum
6. 主程式讀取 index
7. 主程式安裝模組
8. 補版本更新檢查

## 13. 總結

這個架構的重點是：

- 市場 repo 只提供 metadata + release asset
- 主程式負責執行與管理
- 分離能降低衝突，讓兩邊能獨立演進

這是最適合你現在需求的低衝突方案。

## 14. 下一步行動

下一個最小目標：

- 完成 `index.json` 文件
- 放入一個 `examRegistration` module
- 確認 `downloadUrl` 與 `checksumSha256` 正確
- 再接主程式的讀取流程

當這一步完成後，整個外部模組市集就已經從概念變成可用版本。
