# 安全性政策（campus-toolkit-marketplace）

## 回報漏洞

請**不要**開公開 issue。請使用 GitHub 的私人安全回報：

<https://github.com/takan003/campus-toolkit-marketplace/security/advisories/new>

回報時請附上：

1. 受影響的 `index.json`／`site/index.json` 模組與版本
2. 問題類型（checksum、簽章、公鑰信任、下載來源、CI 繞過等）
3. 重現步驟或最小範例
4. 是否已影響實際安裝

修復前請勿公開細節；確認後會盡快回覆與修正。

## 範圍

- `index.json`／`site/index.json` 的完整性與同步
- `releases/*.zip` 的 checksum 與 ed25519 簽章驗證
- `keys.json` 作者公鑰信任清單與撤銷狀態
- 下載來源主機檢查、路徑穿越、CI 狀態守門
- 投稿 PR 的 `experimental`／`reviewed`／`official` 狀態限制

## 不在範圍

- 模組程式碼本身的執行期行為（市集不執行模組；請回報到
  `takan003/campus-toolkit` 或該模組作者）
- 主程式 A 的安裝端邏輯（請回報到 `takan003/campus-toolkit`）
- 已被維護者標為 `experimental` 且明確標示風險的模組

## 已知邊界

市集只負責索引、簽章與發布流程，**不是沙箱**；`reviewed` 代表人審與簽章，
不代表模組沒有伺服器權限。完整政策見
[`docs/投稿與審核流程.md`](docs/投稿與審核流程.md)。
