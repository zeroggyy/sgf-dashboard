# SGF 進度控制台

SGF 進度控制台由三個獨立網頁組成。三頁共用視覺框架與控制台切換選單，但各自擁有獨立的 HTML、CSS、JavaScript 與 Google Apps Script 後端。

## 控制台入口

| 控制台 | 頁面 | 前端程式 | 專屬樣式 |
| --- | --- | --- | --- |
| SGF 企劃進度控制台 | `index.html` | `app_v10.js` | `style.css` |
| SGF 介面進度控制台 | `ui-progress.html` | `ui-progress.js` | `ui-progress.css` |
| SGF 音效語音進度控制台 | `sound-voice-progress.html` | `sound-voice-progress.js` | `sound-voice-progress.css` |

`dashboard-navigation.js` 負責三頁之間的導覽，`dashboard-shared.js` 提供共用通知功能。介面與音效語音頁也會載入 `style.css` 作為基礎樣式。

## 專案結構

```text
.
├── index.html
├── ui-progress.html
├── sound-voice-progress.html
├── style.css
├── ui-progress.css
├── sound-voice-progress.css
├── app_v10.js
├── ui-progress.js
├── sound-voice-progress.js
├── dashboard-shared.js
├── dashboard-navigation.js
├── google-apps-script.js
├── google-apps-script-theme2.js
├── google-apps-script-theme3.js
├── PROGRESS.md
└── .nojekyll
```

三個頁面的必要 DOM 都直接放在各自的 HTML 中，不會在執行時讀取或嵌入其他頁面。

## Google Sheet 串接

| 控制台 | Apps Script 原始碼 |
| --- | --- |
| 企劃進度 | `google-apps-script.js` |
| 介面進度 | `google-apps-script-theme2.js` |
| 音效語音進度 | `google-apps-script-theme3.js` |

部署 Apps Script 時，將對應檔案的完整內容貼到該試算表所連結的 Apps Script 專案 `Code.gs`，再更新既有的網頁應用程式部署。更新既有部署可保留原本的 `/exec` 網址。

### 音效語音資料

- Google Sheet ID：`1QxUnCOf_X01M5CPHBsrkXCJ8NXM3YTnXdq5Ht98R2iE`
- 「確認總表」：由第 3 列起讀取 A 欄武器名稱與 D 欄音效風格。
- 武器名稱應對應同名分頁；找不到分頁或有效動作時，前端顯示「無內容」。
- 武器分頁使用 A 欄動作編號、D 欄指令、G 欄音效狀態、H 欄音效調整需求、I 欄語音狀態、J 欄目前語音。
- 討論紀錄與角色語音進度由 Apps Script 管理其專用資料分頁。

修改 Apps Script 原始碼後，必須建立新版本並更新部署；只儲存程式碼不會更新正式 `/exec` 端點。

## 本地測試

在專案資料夾開啟 PowerShell：

```powershell
python -m http.server 8010 --bind 127.0.0.1
```

瀏覽器開啟：

```text
http://127.0.0.1:8010/
```

不要直接以 `file://` 開啟 HTML，否則瀏覽器的安全限制可能造成模組、請求或剪貼簿功能異常。

## GitHub Pages 部署

1. 將整個專案上傳至 GitHub repository，保持檔案相對位置不變。
2. 在 repository 的 Settings → Pages 選擇要發布的 branch 與根目錄。
3. 保留 `.nojekyll`。
4. 發布後依序測試三個控制台的切換、Google Sheet 讀取、編輯與寫入。

只上傳 HTML 不足以運作；CSS、JavaScript 與共用模組也必須一併上傳。GitHub Pages 使用 HTTPS，Apps Script 網頁應用程式也必須允許實際使用者存取。

## 維護原則

- 共用外觀與通用元件放在 `style.css`。
- 頁面專屬外觀只放在對應的專屬 CSS。
- 頁面功能只放在對應的前端 JavaScript。
- 共用通知與跨頁導覽維持在兩個小型共用模組中。
- 調整其中一個控制台時，避免修改其他頁面的 DOM、資料來源或後端程式。
- 發布前至少執行 JavaScript 語法檢查，並檢查 HTML 引用的本地檔案是否存在。

目前詳細進度與主題三資料規則請參考 `PROGRESS.md`。
