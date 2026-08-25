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
const ADD_UI_DISCUSSION_ACTION = 'addUiDiscussion';
const ITEM_ID_COLUMN = '項目ID';
const DISCUSSION_SHEET_NAME = 'UI_討論紀錄';
const DISCUSSION_HEADERS = ['記錄ID', '項目ID', '留言人', '訊息內容', '討論類型', '當時階段', '建立時間', '是否隱藏'];
const EDITABLE_COLUMNS = [
  '群組編號', '機制', '項目', '序號', '項目說明',
  '企劃開表日', '企劃整合目標日', '美術可用交付日', '最終確認日',
  '介面截圖路徑（需求／代圖）', '美術上傳路徑', '拆圖歸檔路徑',
  '正式完成路徑', '網頁縮圖連結', '備註',
  '企劃需求完成', '製作人需求確認', '程式功能完成', '代圖操作確認',
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
    const discussions = getUiDiscussions(spreadsheet);
    const payload = {
      projectName,
      sheetName: SHEET_NAME,
      columns,
      items,
      discussions,
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
    if (request.action !== UPDATE_UI_ITEM_ACTION && request.action !== ADD_UI_DISCUSSION_ACTION) {
      return jsonResponse({ error: `Unsupported action: ${request.action || '(empty)'}` }, 400);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      let result;
      if (request.action === UPDATE_UI_ITEM_ACTION) {
        const itemId = String(request.itemId || '').trim();
        if (!itemId) throw new Error(`Missing required field: ${ITEM_ID_COLUMN}`);
        if (!request.changes || typeof request.changes !== 'object' || Array.isArray(request.changes)) throw new Error('Missing or invalid changes object');
        result = updateUiItem(itemId, request.changes);
      } else {
        result = addUiDiscussion(request);
      }
      CacheService.getScriptCache().remove(RESPONSE_CACHE_KEY);
      return jsonResponse({ ok: true, action: request.action, ...result });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function getUiDiscussions(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(DISCUSSION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, DISCUSSION_HEADERS.length).getDisplayValues();
  return values.map(row => ({
    recordId: String(row[0] || '').trim(),
    itemId: String(row[1] || '').trim(),
    author: String(row[2] || '').trim(),
    message: String(row[3] || '').trim(),
    type: String(row[4] || '一般討論').trim(),
    stage: String(row[5] || '').trim(),
    createdAt: String(row[6] || '').trim(),
    hidden: String(row[7] || '').trim().toUpperCase() === 'TRUE'
  })).filter(item => item.itemId && item.message && !item.hidden)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function addUiDiscussion(request) {
  const itemId = String(request.itemId || '').trim();
  const author = String(request.author || '').trim();
  const message = String(request.message || '').trim();
  const type = String(request.type || '一般討論').trim();
  const stage = String(request.stage || '').trim();
  const allowedTypes = ['一般討論', '修改要求', '處理回覆', '完成確認'];
  if (!itemId) throw new Error(`Missing required field: ${ITEM_ID_COLUMN}`);
  if (!author) throw new Error('新增討論必須填寫留言人');
  if (!message) throw new Error('新增討論必須填寫訊息內容');
  if (allowedTypes.indexOf(type) === -1) throw new Error('討論類型不正確');
  if (message.length > 5000) throw new Error('訊息內容不可超過 5000 字');

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(DISCUSSION_SHEET_NAME);
  if (!sheet) throw new Error(`找不到分頁：${DISCUSSION_SHEET_NAME}`);
  ensureDiscussionHeaders(sheet);
  const discussion = {
    recordId: Utilities.getUuid(),
    itemId,
    author,
    message,
    type,
    stage,
    createdAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss'),
    hidden: false
  };
  sheet.appendRow([discussion.recordId, discussion.itemId, discussion.author, discussion.message, discussion.type, discussion.stage, discussion.createdAt, discussion.hidden]);
  SpreadsheetApp.flush();
  return { discussion };
}

function ensureDiscussionHeaders(sheet) {
  const current = sheet.getRange(1, 1, 1, DISCUSSION_HEADERS.length).getDisplayValues()[0];
  if (DISCUSSION_HEADERS.some((header, index) => String(current[index] || '').trim() !== header)) {
    throw new Error(`分頁「${DISCUSSION_SHEET_NAME}」欄位順序不正確`);
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
    if (column === '製作人需求確認' && !columnIndex) {
      throw new Error('Google Sheet 缺少欄位：製作人需求確認');
    }
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
    '企劃需求完成', '製作人需求確認', '程式功能完成', '代圖操作確認',
    '美術拆圖完成', '企劃整合完成', '最終確認完成', '退回修改中'
  ];
  if (checkboxColumns.indexOf(column) !== -1) {
    return String(value).toUpperCase() === 'TRUE';
  }
  return value === null || value === undefined ? '' : String(value);
}

/**
 * 一次性資料遷移：新增「製作人需求確認」核取方塊欄位，並保留既有進度。
 *
 * 執行規則：
 * - 已有任一後續階段完成的舊項目，視為過去已通過需求確認，寫入 TRUE。
 * - 尚未進入任何後續階段的項目寫入 FALSE，必須由製作人重新確認。
 *
 * 部署新版 API 前，請在 Apps Script 編輯器手動執行一次本函式。
 */
function migrateRequirementApprovalColumn() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`找不到分頁：${SHEET_NAME}`);

  let lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastColumn < 1) throw new Error('試算表沒有欄位');

  let headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  let approvalColumn = headers.indexOf('製作人需求確認') + 1;

  if (!approvalColumn) {
    approvalColumn = lastColumn + 1;
    sheet.getRange(1, approvalColumn).setValue('製作人需求確認');
    lastColumn = approvalColumn;
    headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
      .map(value => String(value || '').trim());
  }

  if (lastRow < 2) return { updated: 0, column: approvalColumn };

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const downstreamColumns = ['程式功能完成', '代圖操作確認', '美術拆圖完成', '企劃整合完成', '最終確認完成']
    .map(name => headers.indexOf(name))
    .filter(index => index >= 0);
  const values = rows.map(row => [downstreamColumns.some(index => row[index] === true || String(row[index]).toUpperCase() === 'TRUE')]);
  const target = sheet.getRange(2, approvalColumn, values.length, 1);
  target.insertCheckboxes();
  target.setValues(values);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(RESPONSE_CACHE_KEY);
  return { updated: values.length, column: approvalColumn };
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
