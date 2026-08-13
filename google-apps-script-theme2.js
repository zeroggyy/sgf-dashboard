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
const RESPONSE_CACHE_KEY = 'theme2_sheet_payload_v1';
const RESPONSE_CACHE_SECONDS = 60;
const UPDATE_UI_ITEM_ACTION = 'updateUiItem';
const ITEM_ID_COLUMN = '項目ID';
const EDITABLE_COLUMNS = [
  '群組編號', '機制', '項目', '序號', '項目說明',
  '企劃開表日', '企劃整合目標日', '美術可用交付日', '最終確認日',
  '介面截圖路徑（需求／代圖）', '美術上傳路徑', '拆圖歸檔路徑',
  '正式完成路徑', '網頁縮圖連結', '備註',
  '企劃需求完成', '程式功能完成', '代圖操作確認',
  '美術拆圖完成', '企劃整合完成', '最終確認完成',
  '退回修改中', '退回原因', '退回日期', '重新確認日期'
];

function doGet(e) {
  try {
    if (!isAuthorized(e)) {
      return jsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
    }

    const cache = CacheService.getScriptCache();
    const cachedPayload = cache.get(RESPONSE_CACHE_KEY);
    if (cachedPayload) {
      try {
        return jsonResponse(JSON.parse(cachedPayload));
      } catch (cacheError) {
        cache.remove(RESPONSE_CACHE_KEY);
      }
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
    const payload = {
      projectName,
      sheetName: SHEET_NAME,
      columns,
      items,
      updatedAt: new Date().toISOString()
    };
    try {
      cache.put(RESPONSE_CACHE_KEY, JSON.stringify(payload), RESPONSE_CACHE_SECONDS);
    } catch (cacheError) {
      console.warn(`Theme 2 response cache skipped: ${cacheError}`);
    }
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

function doPost(e) {
  try {
    if (!isAuthorized(e)) {
      return jsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
    }

    const request = parseJsonBody(e);
    if (request.action !== UPDATE_UI_ITEM_ACTION) {
      return jsonResponse({ error: `Unsupported action: ${request.action || '(empty)'}` }, 400);
    }

    const itemId = String(request.itemId || '').trim();
    if (!itemId) {
      return jsonResponse({ error: `Missing required field: ${ITEM_ID_COLUMN}` }, 400);
    }
    if (!request.changes || typeof request.changes !== 'object' || Array.isArray(request.changes)) {
      return jsonResponse({ error: 'Missing or invalid changes object' }, 400);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const result = updateUiItem(itemId, request.changes);
      CacheService.getScriptCache().remove(RESPONSE_CACHE_KEY);
      return jsonResponse({ ok: true, action: UPDATE_UI_ITEM_ACTION, ...result });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function parseJsonBody(e) {
  const rawBody = e && e.postData ? e.postData.contents : '';
  if (!rawBody) throw new Error('Request body is empty');
  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error('Request body must be valid JSON');
  }
}

function updateUiItem(itemId, changes) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`找不到分頁：${SHEET_NAME}`);

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastColumn < 1 || lastRow < 2) throw new Error('試算表沒有可更新的資料');

  const columns = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const columnIndexes = {};
  columns.forEach((column, index) => {
    if (column && columnIndexes[column] === undefined) columnIndexes[column] = index + 1;
  });

  const itemIdColumn = columnIndexes[ITEM_ID_COLUMN];
  if (!itemIdColumn) throw new Error(`找不到欄位：${ITEM_ID_COLUMN}`);

  const itemIds = sheet.getRange(2, itemIdColumn, lastRow - 1, 1).getDisplayValues();
  const matches = [];
  itemIds.forEach((row, index) => {
    if (String(row[0] || '').trim() === itemId) matches.push(index + 2);
  });
  if (!matches.length) throw new Error(`找不到項目ID：${itemId}`);
  if (matches.length > 1) throw new Error(`項目ID 重複，無法安全更新：${itemId}`);

  const updates = [];
  EDITABLE_COLUMNS.forEach(column => {
    if (!Object.prototype.hasOwnProperty.call(changes, column)) return;
    const columnIndex = columnIndexes[column];
    if (!columnIndex) return;
    updates.push({ column, columnIndex, value: normalizeCellValue(column, changes[column]) });
  });
  if (!updates.length) throw new Error('沒有可更新的有效欄位');

  const rowNumber = matches[0];
  updates.forEach(update => sheet.getRange(rowNumber, update.columnIndex).setValue(update.value));
  SpreadsheetApp.flush();
  return { itemId, rowNumber, updatedColumns: updates.map(update => update.column) };
}

function normalizeCellValue(column, value) {
  const checkboxColumns = [
    '企劃需求完成', '程式功能完成', '代圖操作確認',
    '美術拆圖完成', '企劃整合完成', '最終確認完成', '退回修改中'
  ];
  if (checkboxColumns.indexOf(column) !== -1) {
    return String(value).toUpperCase() === 'TRUE';
  }
  return value === null || value === undefined ? '' : String(value);
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
