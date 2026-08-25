# SGF Dashboard

最後整理：2026-08-25

SGF Dashboard 是部署於 GitHub Pages 的純前端進度追蹤系統，以 Google Sheet 與 Google Apps Script 作為資料來源及寫回介面。目前包含四個可獨立開啟的控制台。

本檔是專案的主要入口，只說明整體結構、文件導覽與開始工作的方式。功能細節、維護規則及歷史紀錄請依下方連結閱讀，避免在多份文件重複維護相同內容。

## 文件導覽

| 文件 | 用途 | 何時閱讀 |
| --- | --- | --- |
| [`README.md`](README.md) | 專案入口、頁面與檔案結構 | 每次開始工作先讀 |
| [`HANDOFF.md`](HANDOFF.md) | 現行功能、資料來源、維護規則、測試與部署 | 修改程式或交接前閱讀 |
| [`PROGRESS.md`](PROGRESS.md) | 依日期整理的功能演進與目前待辦 | 追查功能由來或規劃下一步時閱讀 |
| [`2026-07-16 WORKLOG.md`](2026-07-16%20WORKLOG.md) | 2026-07-16 的歷史工作快照 | 需要查早期 UI 實作背景時閱讀 |
| [`優化計畫.md`](優化計畫.md) | 後續優化優先順序與驗收方向 | 規劃新功能時閱讀 |

## 控制台入口

| 控制台 | 頁面 | 前端程式 | 樣式 | Apps Script |
| --- | --- | --- | --- | --- |
| 企劃進度 | `index.html` | `app_v10.js` | `style.css` | `google-apps-script.js` |
| UI 進度 | `ui-progress.html` | `ui-progress.js` | `ui-progress.css` | `google-apps-script-theme2.js` |
| 音效／語音進度 | `sound-voice-progress.html` | `sound-voice-progress.js` | `sound-voice-progress.css` | `google-apps-script-theme3.js` |
| Icon 進度 | `icon-progress.html` | `icon-progress.js` | `icon-progress.css` | `google-apps-script-icon.js` |

正式網站：<https://zerogyy.github.io/sgf-dashboard/>

## 專案結構

```text
sgf-dashboard-main/
├── index.html / app_v10.js / style.css
├── ui-progress.html / ui-progress.js / ui-progress.css
├── sound-voice-progress.html / sound-voice-progress.js / sound-voice-progress.css
├── icon-progress.html / icon-progress.js / icon-progress.css
├── dashboard-navigation.js       # 四頁共用導覽
├── dashboard-shared.js           # 共用 Toast 與載入提示
├── google-apps-script*.js        # 各控制台後端原始碼
├── build_icon_tracker_*.mjs      # Icon 範例資料建置工具
├── README.md                     # 專案入口
├── HANDOFF.md                    # 技術與維護手冊
├── PROGRESS.md                   # 功能進度紀錄
├── 優化計畫.md                   # 後續優化計畫
└── 20260812 backup/、20260813 backup/  # 舊版快照，非正式程式來源
```

四個 HTML 都包含自己的完整頁面結構。控制台切換由 `dashboard-navigation.js` 管理，切換時會前往另一個頁面，不是單頁應用程式內的分頁。

## 開始工作的標準流程

1. 確認工作目錄為此專案根目錄。
2. 先讀本檔，再讀 [`HANDOFF.md`](HANDOFF.md)。
3. 若工作涉及既有功能的沿革，再查 [`PROGRESS.md`](PROGRESS.md)。
4. 使用 `rg --files` 重新盤點檔案，不依賴舊備份推測現況。
5. 確認使用者指定的控制台，只修改該頁相關檔案；共用行為才修改共用檔案。
6. 以本地 HTTP server 測試，不能直接用 `file://` 開啟。
7. 若修改 Apps Script，除了提交原始碼外，還必須在對應 Apps Script 專案建立新部署版本。

## 本地啟動

```powershell
python -m http.server 8010 --bind 127.0.0.1
```

測試網址：

- <http://127.0.0.1:8010/index.html>
- <http://127.0.0.1:8010/ui-progress.html>
- <http://127.0.0.1:8010/sound-voice-progress.html>
- <http://127.0.0.1:8010/icon-progress.html>

## 文件維護原則

- README 只保留穩定的入口與結構，不累積逐日修改紀錄。
- 現行功能、資料欄位、測試及部署規則寫入 HANDOFF。
- 已完成的功能變更依日期寫入 PROGRESS。
- 單次工作過程若需要保存，另建日期 WORKLOG，完成後在 PROGRESS 留摘要及連結。
- 未來規劃及優先順序寫入優化計畫，不與已完成功能混寫。
- 文件與程式衝突時，以目前正式程式和實際資料結構為準，並立即修正文檔。
