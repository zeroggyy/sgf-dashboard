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
 *   第四層項目、節點類型、流程順序、截圖、備註，以及原本的進度欄位。
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

/**
 * 接收主題二的工作記錄更新，寫入欄名為「備註」的欄位（目前為 Q 欄）。
 * 前端使用 text/plain 傳送 JSON，避免觸發瀏覽器的 CORS preflight。
 */
function doPost(e) {
  try {
    if (!isAuthorized(e)) {
      return jsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
    }

    const payload = JSON.parse(e && e.postData ? e.postData.contents || '{}' : '{}');
    if (payload.action !== 'updateNote') {
      return jsonResponse({ error: '不支援的操作' }, 400);
    }

    const rowNumber = Number(payload.rowNumber);
    const note = String(payload.note ?? '');
    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      return jsonResponse({ error: '缺少有效的資料列編號' }, 400);
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ error: `找不到分頁：${SHEET_NAME}` }, 404);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(value => String(value || '').trim());
    const noteColumn = headers.findIndex(header => ['備註', '工作記錄', '記錄'].includes(header)) + 1;
    if (!noteColumn) {
      return jsonResponse({ error: '找不到「備註」欄位，請確認 Q 欄標題為「備註」' }, 400);
    }
    if (rowNumber > sheet.getLastRow()) {
      return jsonResponse({ error: '資料列不存在' }, 404);
    }

    sheet.getRange(rowNumber, noteColumn).setValue(note);
    return jsonResponse({ ok: true, rowNumber, noteColumn, updatedAt: new Date().toISOString() });
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
