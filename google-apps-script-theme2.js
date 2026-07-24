/**
 * SGF 主題二｜UI Flow Map Google Apps Script API
 *
 * 使用方式：
 * 1. 在主題二的 Google Sheet 中開啟「擴充功能 → Apps Script」。
 * 2. 將本檔案全部貼入 Apps Script 編輯器。
 * 3. 修改 SPREADSHEET_ID 與 API_KEY。
 * 4. 部署為網頁應用程式：執行身分選「我」、誰有權限選「任何人」。
 * 5. 將產生的 /exec URL 與 API_KEY 填回主題二網頁設定。
 *
 * Google Sheet：
 * - 分頁名稱固定為 SGF_UI_DataBase
 * - 第一列為欄位名稱
 * - 目前建議欄位包含：專案名稱、第一層節點、第二層節點、第三層節點、
 *   第四層項目、節點類型、流程順序、截圖，以及原本的進度欄位。
 */

const SPREADSHEET_ID = '請填入主題二 Google Sheet ID';
const SHEET_NAME = 'SGF_UI_DataBase';
const API_KEY = '請自行設定一組長且隨機的 API Key';

function doGet(e) {
  try {
    if (!isAuthorized(e)) {
      return jsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ error: `找不到分頁：${SHEET_NAME}` }, 404);
    }

    const values = sheet.getDataRange().getDisplayValues();
    if (!values.length) {
      return jsonResponse({ projectName: '', columns: [], items: [] });
    }

    const columns = values[0].map(value => String(value || '').trim());
    const items = values.slice(1)
      .filter(row => row.some(value => String(value || '').trim() !== ''))
      .map((row, index) => {
        const item = { rowNumber: index + 2 };
        columns.forEach((column, columnIndex) => {
          if (column) item[column] = String(row[columnIndex] || '').trim();
        });
        return item;
      });

    const projectName = items.find(item => item['專案名稱'])?.['專案名稱'] || 'SGF 專案';
    return jsonResponse({
      projectName,
      sheetName: SHEET_NAME,
      columns,
      items,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

function isAuthorized(e) {
  const providedKey = e && e.parameter ? e.parameter.key : '';
  return API_KEY && API_KEY !== '請自行設定一組長且隨機的 API Key' && providedKey === API_KEY;
}

function jsonResponse(payload, statusCode) {
  // Apps Script Content Service 不支援自訂 HTTP status；錯誤狀態會透過 JSON 欄位傳回。
  return ContentService
    .createTextOutput(JSON.stringify({ status: statusCode || 200, ...payload }))
    .setMimeType(ContentService.MimeType.JSON);
}
