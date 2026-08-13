# SGF 進度控制台

最後盤點：2026-08-12

這是一個部署於 GitHub Pages 的純前端專案，由三個獨立控制台組成。三頁共用視覺基礎、通知與控制台切換選單，但各自擁有獨立的 HTML、CSS、JavaScript 與 Google Apps Script 後端。

> 換裝置或交給新的 Codex 工作時，請先讀本檔，再讀 [`HANDOFF.md`](HANDOFF.md)。主題三的歷史細節另見 [`PROGRESS.md`](PROGRESS.md)。

## 頁面入口

| 控制台 | 網頁 | 前端 | 專屬樣式 | Apps Script | 能否寫回 |
| --- | --- | --- | --- | --- | --- |
| SGF 企劃進度控制台 | `index.html` | `app_v10.js` | `style.css` | `google-apps-script.js` | 可以 |
| SGF 介面進度控制台 | `ui-progress.html` | `ui-progress.js` | `ui-progress.css` | `google-apps-script-theme2.js` | 目前僅讀取 |
| SGF 音效語音進度控制台 | `sound-voice-progress.html` | `sound-voice-progress.js` | `sound-voice-progress.css` | `google-apps-script-theme3.js` | 可以 |

正式 GitHub Pages：<https://zerogyy.github.io/sgf-dashboard/>

三頁網址分別為：

- `/sgf-dashboard/index.html`
- `/sgf-dashboard/ui-progress.html`
- `/sgf-dashboard/sound-voice-progress.html`

## 專案結構

```text
.
├── index.html                       # 主題一：企劃進度
├── ui-progress.html                 # 主題二：介面進度
├── sound-voice-progress.html        # 主題三：音效語音進度
├── style.css                        # 共用基礎＋主題一樣式
├── ui-progress.css                  # 主題二樣式
├── sound-voice-progress.css         # 主題三樣式
├── app_v10.js                       # 主題一前端
├── ui-progress.js                   # 主題二前端
├── sound-voice-progress.js          # 主題三前端
├── dashboard-shared.js              # 共用 Toast
├── dashboard-navigation.js          # 三頁導覽抽屜
├── google-apps-script.js            # 主題一後端
├── google-apps-script-theme2.js     # 主題二後端
├── google-apps-script-theme3.js     # 主題三後端
├── HANDOFF.md                       # 跨裝置／Codex 交接筆記
├── PROGRESS.md                      # 主題三歷史進度
└── .nojekyll                        # GitHub Pages 保留檔
```

三個 HTML 均包含自己的完整 DOM，不會在執行時嵌入其他 HTML。切換控制台會進入另一個網址，由 `dashboard-navigation.js` 集中管理。

## 功能摘要

### 主題一：企劃進度

- 顯示總任務、已結案、未結案與完成率。
- 搜尋任務名稱與目標內容。
- 負責人篩選順序：全部、未分派、企劃，其餘名稱依 A–Z／字典序排列。
- 負責權限支援主要與支援；負責人複選時自動選主要＋支援，回到單選時回到主要。
- 未結案／已結案、上週／本週／下週、特殊符號條件篩選。
- 依群組展開、折疊與專注；新增任務、複製目前篩選任務。
- 編輯任務名稱、ID、主負責人、協辦人、連結、目標、完成狀態與週進度。
- 進度歷程預設只顯示近期，上週以前可折疊；也可切換全部歷程。
- 目標文字中的 HTTP/HTTPS 網址會轉成可點擊連結。
- 時程視窗依年、月、週查看並可編輯 F 欄目標與 H 欄補充內容。
- 可呼叫 Apps Script 的 `manualSortTasks` 排序。

### 主題二：介面進度

- 搜尋機制、項目、項目說明、序號。
- 依機制與期望完成時間篩選；空白期望完成顯示「未定」。
- 交付流程分布可點擊篩選，再點同一階段解除。
- 流程地圖以「專案 → 機制 → UI 項目」展開，顯示進度、資料完整度與縮圖。
- 詳細視窗顯示項目名稱、D 欄項目說明、機制、序號、目前階段、日期與三個資料路徑；路徑可一鍵複製。
- 目前階段依第一個未完成的布林欄位推算。
- API 請求：20 秒逾時，失敗後重試 2 次；全失敗時使用上次成功資料。
- Apps Script 摘要快取 60 秒。
- 目前為唯讀頁面，尚未實作詳細項目的討論紀錄與寫回功能。

交付階段顯示名稱：

```text
企劃需求 → 程式施工 → 功能驗證 → 美術製作 → 正式介面 → 待驗收 → 已完成
```

Google Sheet 的原始流程欄仍是：`企劃`、`功能`、`代圖操作`、`拆圖`、`編輯`、`final`。不要因畫面改名而直接改欄名。

### 主題三：音效語音進度

- 以武器卡呈現音效、語音完成度與最新更新時間。
- 搜尋與狀態篩選；狀態為未開始、待製作、已製作、待修改、已確認、不需製作、無內容。
- 點武器後才載入明細，避免一次下載所有角色語音資料。
- 音效與語音分頁、狀態篩選、角色篩選與武將總覽。
- 語音支援依角色編號名稱、待修改數、完成度排序。
- 音效／語音明細可進入快速編輯，複選後一次批次改狀態。
- 單一指令編輯可切換音效／語音，更新狀態並新增具名討論。
- 討論紀錄依音效、語音角色區分，預設最新 3 筆，可展開全部。
- 可編輯武器音效風格，並同步建立「動作 × 適用角色」語音矩陣。
- 摘要具有 Apps Script 快取、前端逾時／重試及上次成功資料備援。

## Google Sheet 與 Apps Script

### 主題一

- Apps Script 使用綁定試算表的 `Task` 與 `時程` 分頁。
- `Task` 第 1 列包含週別（例如 W27），第 2 列包含完成、專案項目、主、協、目標、完成度等欄名，第 3 列起為資料。
- `時程` 使用 C 欄日期、D 欄星期、F 欄目標、H 欄補充內容。
- GET 讀取任務、週別與時程；POST 支援建立任務、更新任務、排序與更新時程。

### 主題二

- 分頁固定為 `SGF_UI_DataBase`，第 1 列為欄名，第 2 列起為資料。
- 主要欄位：製作批次、機制、項目、項目說明、序號、企劃開表、期望完成、美術提交、介面截圖路徑、美術上傳路徑、拆圖歸檔路徑、備註，以及六個流程布林欄。
- `製作批次` 目前不顯示在網頁，也沒有批次篩選。
- `google-apps-script-theme2.js` 內的 `SPREADSHEET_ID` 與 `API_KEY` 是範例占位字；貼到 Apps Script 前必須保留／填回正式值。

### 主題三

- `確認總表`：第 3 列起，A 欄武器名稱、D 欄音效風格。
- 同名武器分頁：A 動作編號、D 指令、G 音效狀態、H 音效調整需求。
- `角色清單`：A～C 為角色 ID、名稱、啟用；D 欄之後為各武器適用勾選。
- `角色語音進度`：同步建立武器 × 動作 × 適用角色資料。
- `音效討論紀錄`：保存音效／語音留言及角色範圍。
- `更新紀錄`：保存最後更新時間來源。

修改任何 `google-apps-script*.js` 後，必須把內容貼回對應 Apps Script 專案，建立新版本並更新 Web App 部署；只在本地或 GitHub 更新檔案不會改變線上 API。

## 本地測試

在專案資料夾開啟 PowerShell：

```powershell
python -m http.server 8010 --bind 127.0.0.1
```

開啟：

```text
http://127.0.0.1:8010/index.html
http://127.0.0.1:8010/ui-progress.html
http://127.0.0.1:8010/sound-voice-progress.html
```

不要使用 `file://`，否則網路請求、剪貼簿與部分瀏覽器功能可能異常。

## GitHub Pages 發布

1. 將整個資料夾內容推送至 GitHub repository。
2. Settings → Pages 選擇正式 branch 與根目錄。
3. 保留 `.nojekyll`。
4. 等待 Pages 部署完成，使用 `Ctrl + F5` 強制重新整理。
5. 依序測試三頁切換、讀取、編輯與 Google Sheet 寫入。

HTML、CSS、JavaScript 與共用檔案必須一起上傳。網址不會因拆頁而自動跳轉；需直接查看各頁路徑。

## 維護規則

- 修改單一控制台時，優先只改該頁的 HTML／JS／CSS／Apps Script。
- 共用導覽才修改 `dashboard-navigation.js`；共用 Toast 才修改 `dashboard-shared.js`。
- `style.css` 仍是三頁共用基礎，修改前要檢查是否影響主題二、三。
- 前端資源修改後同步提高 HTML 中的 `?v=` 版本，避免 GitHub Pages／瀏覽器舊快取。
- 不要把實際 API Key 再複製進交接文件或公開 issue；正式金鑰目前存在前端原始碼，屬於輕量防誤用而非真正祕密保護。
- 發布前執行 JavaScript 語法檢查，並在真實瀏覽器測試主要流程。
# 2026-08-13｜Icon 製作進度控制台

新增第四個獨立頁面 `icon-progress.html`，資料來源為 Google Sheet 的 `SGF_ICON_DataBase` 與 `SGF_ICON_Locale` 兩個分頁。

- 主表以 `Icon ID` 作為唯一識別碼。
- 語系表以 `Icon ID + 語言` 作為唯一識別組合。
- 流程為企劃需求、美術完稿、輸出切圖、企劃驗收，另支援退回處理、已結案與不適用。
- 頁面提供摘要、搜尋、類型／子類型／階段／UI 機制／語系篩選、分類卡片、詳情及雙表寫回。
- Apps Script 程式位於 `google-apps-script-icon.js`，需使用獨立 Apps Script 專案或獨立部署，避免與其他控制台的 `doGet/doPost` 衝突。

部署時請設定 `SPREADSHEET_ID` 與 `API_KEY`，重新部署成 Web App，再於 Icon 頁面的「API 設定」填入 `/exec` URL 與相同 API Key。
