/**
 * SGF 武器音效進度控制台：Google Apps Script API
 *
 * 規則：
 * - 確認總表：第 3 列起，A 欄武器名稱、D 欄音效風格。
 * - 同名武器分頁：第 3 列起，A 動作編號、D 指令、G 音效狀態、H 音效調整需求。
 * - 角色清單：角色 ID、角色名稱、是否啟用。
 * - 角色語音進度：由 syncVoiceMatrix 自動補齊「武器 × 動作 × 啟用角色」。
 *
 * 讀取 API 分為摘要與單一武器明細，避免首頁下載所有角色語音資料。
 */

const SPREADSHEET_ID = '1QxUnCOf_X01M5CPHBsrkXCJ8NXM3YTnXdq5Ht98R2iE';
const API_KEY = 'SGF_THEME3_WEAPON_SOUND_2026_w8Kp4Xn7Qm2Vz9Ld';
const MASTER_SHEET_NAME = '確認總表';
const DISCUSSION_SHEET_NAME = '音效討論紀錄';
const ROSTER_SHEET_NAME = '角色清單';
const VOICE_SHEET_NAME = '角色語音進度';
const DATA_START_ROW = 3;
const STATUS_VALUES = ['未開始', '待製作', '已製作', '待修改', '已確認', '不需製作'];
const DISCUSSION_HEADERS = ['武器名稱', '動作編號', '日期', '留言人', '討論內容', '討論類型', '角色 ID', '角色名稱'];
const ROSTER_HEADERS = ['角色 ID', '角色名稱', '啟用'];
const VOICE_HEADERS = ['唯一鍵', '武器名稱', '動作編號', '指令', '角色 ID', '角色名稱', '語音狀態', '目前語音', '備註', '更新時間'];

function doGet(e) {
  try {
    requireAuthorization(e);
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const weaponName = String((e.parameter && e.parameter.weapon) || '').trim();
    return jsonResponse(weaponName ? getWeaponDetail(spreadsheet, weaponName) : getDashboardSummary(spreadsheet));
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function doPost(e) {
  try {
    requireAuthorization(e);
    const payload = parseBody(e);
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let result;
    if (payload.action === 'syncVoiceMatrix') result = syncVoiceMatrix(spreadsheet);
    else if (payload.action === 'updateAction') result = updateSoundAction(spreadsheet, payload);
    else if (payload.action === 'updateVoiceRecord') result = updateVoiceRecord(spreadsheet, payload);
    else throw new Error('Unsupported action');
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function getDashboardSummary(spreadsheet) {
  const masterSheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);
  if (!masterSheet) throw new Error(`找不到分頁：${MASTER_SHEET_NAME}`);
  const voiceRows = getVoiceRows(spreadsheet);
  const voiceByWeapon = groupBy(voiceRows, row => row.weaponName);
  const weapons = getMasterWeapons(masterSheet).map(weapon => {
    const actions = getWeaponActions(spreadsheet, weapon.name);
    const voices = voiceByWeapon[weapon.name] || [];
    return {
      ...weapon,
      hasContent: actions.length > 0,
      actionCount: actions.length,
      soundCounts: countStatuses(actions, 'soundStatus'),
      voiceCounts: countStatuses(voices, 'voiceStatus'),
      voiceCharacterCount: new Set(voices.map(row => row.characterId).filter(Boolean)).size,
      voiceRecordCount: voices.length
    };
  });
  const roster = getRoster(spreadsheet);
  return {
    weapons,
    rosterReady: roster.exists && roster.active.length > 0,
    voiceDataReady: spreadsheet.getSheetByName(VOICE_SHEET_NAME) !== null,
    updatedAt: new Date().toISOString()
  };
}

function getWeaponDetail(spreadsheet, weaponName) {
  const masterSheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);
  if (!masterSheet) throw new Error(`找不到分頁：${MASTER_SHEET_NAME}`);
  const weapon = getMasterWeapons(masterSheet).find(item => item.name === weaponName);
  if (!weapon) throw new Error(`確認總表沒有武器：${weaponName}`);
  const discussions = getDiscussions(spreadsheet);
  const voiceByAction = groupBy(getVoiceRows(spreadsheet).filter(row => row.weaponName === weaponName), row => row.actionId);
  const actions = getWeaponActions(spreadsheet, weaponName).map(action => ({
    ...action,
    discussions: discussions[discussionKey(weaponName, action.id)] || [],
    voiceEntries: voiceByAction[action.id] || []
  }));
  return { weapon: { ...weapon, hasContent: actions.length > 0, actions }, updatedAt: new Date().toISOString() };
}

function getMasterWeapons(masterSheet) {
  if (masterSheet.getLastRow() < DATA_START_ROW) return [];
  return masterSheet.getRange(DATA_START_ROW, 1, masterSheet.getLastRow() - DATA_START_ROW + 1, 4).getDisplayValues()
    .map(row => ({ name: String(row[0] || '').trim(), style: String(row[3] || '').trim() }))
    .filter(weapon => weapon.name);
}

function getWeaponActions(spreadsheet, weaponName) {
  const sheet = spreadsheet.getSheetByName(weaponName);
  if (!sheet || sheet.getLastRow() < DATA_START_ROW) return [];
  return sheet.getRange(DATA_START_ROW, 1, sheet.getLastRow() - DATA_START_ROW + 1, 8).getDisplayValues()
    .map((row, index) => ({
      id: String(row[0] || '').trim(),
      command: String(row[3] || '').trim(),
      soundStatus: normalizeStatus(row[6]),
      soundNote: String(row[7] || '').trim(),
      rowNumber: DATA_START_ROW + index
    }))
    .filter(action => action.id || action.command);
}

function getRoster(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(ROSTER_SHEET_NAME);
  if (!sheet) return { exists: false, active: [] };
  if (sheet.getLastRow() < 2) return { exists: true, active: [] };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ROSTER_HEADERS.length).getDisplayValues();
  const active = rows.map(row => ({ id: String(row[0] || '').trim(), name: String(row[1] || '').trim(), enabled: isEnabled(row[2]) }))
    .filter(character => character.id && character.name && character.enabled);
  return { exists: true, active };
}

function getVoiceRows(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(VOICE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, VOICE_HEADERS.length).getDisplayValues()
    .map((row, index) => ({
      key: String(row[0] || '').trim(), weaponName: String(row[1] || '').trim(), actionId: String(row[2] || '').trim(), command: String(row[3] || '').trim(),
      characterId: String(row[4] || '').trim(), characterName: String(row[5] || '').trim(), voiceStatus: normalizeStatus(row[6]),
      currentVoice: String(row[7] || '').trim(), note: String(row[8] || '').trim(), rowNumber: index + 2
    })).filter(row => row.weaponName && row.actionId && row.characterId);
}

function syncVoiceMatrix(spreadsheet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rosterSheet = ensureSheet(spreadsheet, ROSTER_SHEET_NAME, ROSTER_HEADERS);
    const voiceSheet = ensureSheet(spreadsheet, VOICE_SHEET_NAME, VOICE_HEADERS);
    const masterSheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);
    if (!masterSheet) throw new Error(`找不到分頁：${MASTER_SHEET_NAME}`);
    const migrated = migrateLegacyStatuses(spreadsheet, masterSheet, voiceSheet);
    const roster = getRoster(spreadsheet);
    if (!roster.active.length) return { created: 0, migrated, rosterCount: 0, message: `已更新 ${migrated} 筆既有狀態；請在「${ROSTER_SHEET_NAME}」填入啟用角色後，再同步角色語音項目。` };
    const existingKeys = new Set(getVoiceRows(spreadsheet).map(row => row.key));
    const now = Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), 'yyyy/MM/dd HH:mm');
    const additions = [];
    getMasterWeapons(masterSheet).forEach(weapon => {
      getWeaponActions(spreadsheet, weapon.name).forEach(action => {
        roster.active.forEach(character => {
          const key = voiceKey(weapon.name, action.id, character.id);
          if (!existingKeys.has(key)) additions.push([key, weapon.name, action.id, action.command, character.id, character.name, '未開始', '', '', now]);
        });
      });
    });
    if (additions.length) voiceSheet.getRange(voiceSheet.getLastRow() + 1, 1, additions.length, VOICE_HEADERS.length).setValues(additions);
    return { created: additions.length, migrated, rosterCount: roster.active.length, message: additions.length ? `已新增 ${additions.length} 筆角色語音項目。` : migrated ? `已更新 ${migrated} 筆既有狀態。` : '沒有缺少的角色語音項目。' };
  } finally {
    lock.releaseLock();
  }
}

function updateSoundAction(spreadsheet, payload) {
  const weaponName = String(payload.weaponName || '').trim();
  const rowNumber = Number(payload.rowNumber);
  const actionId = String(payload.actionId || '').trim();
  const sheet = spreadsheet.getSheetByName(weaponName);
  if (!sheet || !actionId || !Number.isInteger(rowNumber) || rowNumber < DATA_START_ROW || rowNumber > sheet.getLastRow()) throw new Error('音效動作資料不正確');
  if (String(sheet.getRange(rowNumber, 1).getDisplayValue() || '').trim() !== actionId) throw new Error('動作編號與指定列不一致');
  sheet.getRange(rowNumber, 7, 1, 2).setValues([[normalizeStatus(payload.soundStatus), String(payload.soundNote || '').trim()]]);
  appendDiscussionFromPayload(spreadsheet, weaponName, actionId, payload.discussion);
  return { actionId, rowNumber };
}

function updateVoiceRecord(spreadsheet, payload) {
  const sheet = spreadsheet.getSheetByName(VOICE_SHEET_NAME);
  const rowNumber = Number(payload.voiceRowNumber);
  const key = String(payload.voiceKey || '').trim();
  if (!sheet || !key || !Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('角色語音資料不正確');
  if (String(sheet.getRange(rowNumber, 1).getDisplayValue() || '').trim() !== key) throw new Error('角色語音唯一鍵與指定列不一致');
  sheet.getRange(rowNumber, 7, 1, 4).setValues([[normalizeStatus(payload.voiceStatus), String(payload.currentVoice || '').trim(), String(payload.voiceNote || '').trim(), Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), 'yyyy/MM/dd HH:mm')]]);
  appendDiscussionFromPayload(spreadsheet, String(payload.weaponName || '').trim(), String(payload.actionId || '').trim(), payload.discussion);
  return { key, rowNumber };
}

function appendDiscussionFromPayload(spreadsheet, weaponName, actionId, discussion) {
  const author = String((discussion || {}).author || '').trim();
  const message = String((discussion || {}).message || '').trim();
  if (!message) return;
  if (!author) throw new Error('新增討論必須填寫留言人');
  let sheet = spreadsheet.getSheetByName(DISCUSSION_SHEET_NAME);
  if (!sheet) sheet = ensureSheet(spreadsheet, DISCUSSION_SHEET_NAME, DISCUSSION_HEADERS);
  ensureDiscussionColumns(sheet);
  const date = Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), 'yyyy/MM/dd HH:mm');
  const type = String((discussion || {}).type || '共用').trim();
  const characterId = String((discussion || {}).characterId || '').trim();
  const characterName = String((discussion || {}).characterName || '').trim();
  sheet.appendRow([weaponName, actionId, date, author, message, type, characterId, characterName]);
}

function getDiscussions(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(DISCUSSION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, DISCUSSION_HEADERS.length).getDisplayValues().reduce((result, row) => {
    const key = discussionKey(String(row[0] || '').trim(), String(row[1] || '').trim());
    if (!result[key]) result[key] = [];
    result[key].push({ date: String(row[2] || '').trim(), author: String(row[3] || '').trim(), text: String(row[4] || '').trim(), type: String(row[5] || '共用').trim(), characterId: String(row[6] || '').trim(), characterName: String(row[7] || '').trim() });
    return result;
  }, {});
}

function countStatuses(items, property) {
  return STATUS_VALUES.reduce((counts, status) => { counts[status] = items.filter(item => item[property] === status).length; return counts; }, {});
}
function normalizeStatus(value) { const status = String(value || '').trim(); const legacy = { '待確認': '未開始', '最終確認': '已確認' }; return STATUS_VALUES.includes(status) ? status : (legacy[status] || '未開始'); }
function migrateLegacyStatuses(spreadsheet, masterSheet, voiceSheet) {
  let changed = 0;
  const migrateRange = range => {
    const values = range.getDisplayValues();
    const next = values.map(([value]) => {
      const normalized = normalizeStatus(value);
      if (normalized !== String(value || '').trim()) changed += 1;
      return [normalized];
    });
    if (next.length) { range.setValues(next); applyStatusValidation(range); }
  };
  if (voiceSheet.getLastRow() >= 2) migrateRange(voiceSheet.getRange(2, 7, voiceSheet.getLastRow() - 1, 1));
  getMasterWeapons(masterSheet).forEach(weapon => {
    const sheet = spreadsheet.getSheetByName(weapon.name);
    if (sheet && sheet.getLastRow() >= DATA_START_ROW) migrateRange(sheet.getRange(DATA_START_ROW, 7, sheet.getLastRow() - DATA_START_ROW + 1, 1));
  });
  return changed;
}
function applyStatusValidation(range) { range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, true).setAllowInvalid(false).build()); }
function isEnabled(value) { return ['TRUE', '啟用', '是', 'YES', '1'].includes(String(value || '').trim().toUpperCase()); }
function groupBy(items, keyFn) { return items.reduce((groups, item) => { const key = keyFn(item); (groups[key] = groups[key] || []).push(item); return groups; }, {}); }
function voiceKey(weaponName, actionId, characterId) { return `${weaponName}__${actionId}__${characterId}`; }
function discussionKey(weaponName, actionId) { return `${weaponName}::${actionId}`; }
function ensureSheet(spreadsheet, name, headers) { let sheet = spreadsheet.getSheetByName(name); if (!sheet) { sheet = spreadsheet.insertSheet(name); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); sheet.setFrozenRows(1); } return sheet; }
function ensureDiscussionColumns(sheet) { if (sheet.getLastColumn() < DISCUSSION_HEADERS.length) sheet.getRange(1, 1, 1, DISCUSSION_HEADERS.length).setValues([DISCUSSION_HEADERS]); }
function parseBody(e) { const raw = e && e.postData && e.postData.contents ? e.postData.contents : ''; if (!raw) return {}; try { return JSON.parse(raw); } catch (error) { throw new Error('POST 資料必須是 JSON'); } }
function requireAuthorization(e) { const key = e && e.parameter ? String(e.parameter.key || '') : ''; if (!API_KEY || key !== API_KEY) throw new Error('Unauthorized: Invalid API Key'); }
function jsonResponse(payload, status) { return ContentService.createTextOutput(JSON.stringify({ status: status || 200, ...payload })).setMimeType(ContentService.MimeType.JSON); }
