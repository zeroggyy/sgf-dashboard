import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const baseDir = path.resolve("icon-tracker-sample");
const outDir = path.join(baseDir, "imported-current-data");
await fs.mkdir(outDir, { recursive: true });

const localeSourcePath = path.join(baseDir, "SGF 介面素材需求表 - 多國語圖字.csv");
const iconSourcePath = path.join(baseDir, "SGF 介面素材需求表 - 介面圖示.csv");

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const clean = value => String(value ?? "").trim();
const normalizeSize = value => clean(value).replace(/(\d)\s*[x*]\s*(\d)/gi, "$1×$2");
const splitSizes = value => normalizeSize(value).split(/\r?\n/).map(clean).filter(Boolean);
const completedStage = status => /^(已完成|完成)$/.test(clean(status)) ? "已結案" : "";

const iconHeaders = ["Icon ID","群組 ID","類型","子類型","內部名稱","顯示名稱 Key","規格處理方式","主要尺寸","其他尺寸","格式","多狀態","狀態種類","目前階段","負責人","企劃規格完成","美術草稿完成","草稿確認完成","美術完稿完成","輸出切圖完成","程式整合完成","遊戲內確認完成","退回修改中","退回原因","需求圖連結","預覽圖連結","來源檔路徑","輸出路徑","檔名","需求日","目標日","最終確認日","備註"];
const localeHeaders = ["Text Key","語言","顯示文字","翻譯狀態","需要語系圖","語系圖連結","最後確認日","備註"];
const mapHeaders = ["關聯 ID","Icon ID","UI 項目 ID","UI 機制","使用位置","是否必要","使用狀態","備註"];
const listHeaders = ["清單類型","代碼","顯示值","排序","啟用","說明"];

const iconRows = [];
const localeRows = [];
const mapRows = [];
const sourceIconRows = parseCsv(await fs.readFile(iconSourcePath, "utf8"));

let group = null;
const typeCounters = {};
const groupDefs = [
  [/武器/, "WEAPON", "武器", "武器種類"],
  [/武將頭像|spine/i, "PORTRAIT", "頭像", "武將頭像"],
  [/場景/, "SCENE", "場景", "大型場景 Icon"],
  [/手機版本按鍵|招式表/, "CONTROL", "操作按鍵", "手機按鍵／招式表"],
  [/Wifi/i, "WIFI", "狀態圖示", "Wi-Fi 訊號"]
];

function identifyGroup(name) {
  const found = groupDefs.find(([pattern]) => pattern.test(name));
  return found ? { code: found[1], type: found[2], subtype: found[3] } : { code: "OTHER", type: "其他", subtype: name };
}

function addMap(iconId, mechanism, position, note = "") {
  mapRows.push([`MAP-${String(mapRows.length + 1).padStart(4, "0")}`, iconId, "", mechanism, position, "", "", note]);
}

for (const row of sourceIconRows) {
  const status = clean(row[0]); const item = clean(row[1]);
  if (!item || status === "狀態") continue;
  if (!status) {
    const identified = identifyGroup(item);
    const sizes = splitSizes(row[2]);
    const groupNote = clean(row[3]);
    group = { ...identified, name: item, id: `GRP-${identified.code}`, sizes, note: groupNote };
    continue;
  }
  if (!group) continue;
  const names = item.split(/[、，]/).map(clean).filter(Boolean);
  for (const name of names) {
    typeCounters[group.code] = (typeCounters[group.code] || 0) + 1;
    const seq = String(typeCounters[group.code]).padStart(3, "0");
    const iconId = `ICON-${group.code}-${seq}`;
    const ownSizes = splitSizes(row[2]);
    const sizes = ownSizes.length ? ownSizes : group.sizes;
    const ownNote = clean(row[3]);
    const combinedNote = [group.note && !group.note.startsWith("\\\\") ? group.note : "", ownNote, `來源狀態：${status}`].filter(Boolean).join("；");
    const sourcePath = group.note.startsWith("\\\\") ? group.note : "";
    const isAutomatic = /不處理|自動切/.test(group.name + group.note + ownNote);
    iconRows.push([
      iconId, group.id, group.type, group.subtype, name, `icon.${group.code.toLowerCase()}.${seq}`,
      isAutomatic ? "編輯器自動產生" : "", sizes[0] || "", sizes.slice(1).join("、"), "", false, "",
      isAutomatic ? "不適用" : completedStage(status), "", "", "", "", "", "", "", "", "", "",
      "", "", sourcePath, "", clean(row[4]), "", "", "", combinedNote
    ]);
    if (group.code === "CONTROL") {
      addMap(iconId, "手機戰鬥介面", "手機按鍵", "來源指出同時用於手機按鍵與招式表");
      addMap(iconId, "招式表", "招式表圖示", "UI 項目 ID 待補");
    } else if (group.code === "WIFI") addMap(iconId, "網路狀態", "Wi-Fi 訊號顯示", ownNote);
    else if (group.code === "SCENE") addMap(iconId, "場景選擇", "場景 Icon", group.note);
    else if (group.code === "PORTRAIT") addMap(iconId, "武將介面", "武將頭像", "由編輯器自動切圖");
  }
}

const sourceLocaleRows = parseCsv(await fs.readFile(localeSourcePath, "utf8"));
const localeCodes = ["zh-TW", "zh-CN", "en", "ja", "ko"];
let textCounter = 0;
for (const row of sourceLocaleRows.slice(3)) {
  const item = clean(row[0]);
  if (!item || item === "字形" || /_Font$/.test(item)) continue;
  textCounter += 1;
  const seq = String(textCounter).padStart(3, "0");
  const iconId = `TEXT-MULTI-${seq}`;
  const textKey = `graphic.text.${seq}`;
  const sourceInstruction = clean(row[6]);
  const reference = clean(row[7]);
  const isExcluded = /關閉|不修改|改系統字|改成特效/.test(sourceInstruction);
  const isDone = sourceInstruction === "完成";
  iconRows.push([
    iconId, "GRP-MULTI-TEXT", "多國語圖字", "多國語圖字", item.replace(/\r?\n/g, " "), textKey,
    isExcluded ? sourceInstruction : "各語系分別驗收", "", "", "", false, "", isExcluded ? "不適用" : (isDone ? "已結案" : ""), "",
    "", "", "", "", "", "", "", "", "", reference, reference, "", "", "", "", "", "",
    [`來源狀態：${sourceInstruction || "空白"}`, item.includes("\n") ? "來源項目含換行" : ""].filter(Boolean).join("；")
  ]);
  for (let i = 0; i < 5; i += 1) {
    const rawValue = clean(row[i + 1]);
    const reuse = /^使用(繁中|英文)$/.test(rawValue);
    localeRows.push([
      textKey, localeCodes[i], reuse ? "" : rawValue,
      rawValue && !reuse && isDone ? "已確認" : "", "", "", "",
      reuse ? `來源指示：${rawValue}` : (!rawValue ? "來源空白" : "")
    ]);
  }
  addMap(iconId, "", item.replace(/\r?\n/g, " "), sourceInstruction);
}

const distinctTypes = [...new Set(iconRows.map(row => row[2]))];
const listRows = [];
distinctTypes.forEach((value, index) => listRows.push(["Icon類型", `type_${String(index + 1).padStart(2, "0")}`, value, index + 1, true, "由來源資料整理"]));
[
  ["completed","已結案","來源為「已完成／完成」"],
  ["not_applicable","不適用","不修改、改用系統字、改成特效或工具自動產生"],
  ["planning","待企劃規格","保留供後續確認；本次未把「未完成」自動映射至此"],
  ["draft","待美術草稿",""], ["draft_review","待企劃確認草稿",""], ["final_art","待美術完稿",""],
  ["export","待輸出切圖",""], ["integration","待程式整合",""], ["game_review","待遊戲內確認",""], ["returned","退回處理中",""]
].forEach((entry, index) => listRows.push(["製作階段", entry[0], entry[1], index + 1, true, entry[2]]));
[
  ["todo","待翻譯"], ["translating","翻譯中"], ["review","待確認"], ["confirmed","已確認"], ["na","不適用"]
].forEach((entry, index) => listRows.push(["翻譯狀態", entry[0], entry[1], index + 1, true, ""]));
[
  ["zh-TW","繁體中文"], ["zh-CN","簡體中文"], ["en","英文"], ["ja","日文"], ["ko","韓文"]
].forEach((entry, index) => listRows.push(["語言", entry[0], entry[1], index + 1, true, ""]));

const sheets = {
  SGF_ICON_DataBase: [iconHeaders, ...iconRows],
  SGF_ICON_Locale: [localeHeaders, ...localeRows],
  SGF_ICON_UI_Map: [mapHeaders, ...mapRows],
  SGF_ICON_Lists: [listHeaders, ...listRows]
};

const csvEscape = value => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const workbook = Workbook.create();
for (const [name, rows] of Object.entries(sheets)) {
  rows.forEach((row, index) => {
    if (row.length !== rows[0].length) throw new Error(`${name} row ${index + 1} has ${row.length} columns; expected ${rows[0].length}`);
  });
  const sheet = workbook.worksheets.add(name);
  const rowCount = rows.length; const colCount = rows[0].length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  range.values = rows;
  range.format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center" };
  sheet.getRangeByIndexes(0, 0, 1, colCount).format = { fill: "#456B5A", font: { bold: true, color: "#FFFFFF", name: "Arial", size: 10 }, wrapText: true, verticalAlignment: "center" };
  sheet.getRangeByIndexes(0, 0, 1, colCount).format.rowHeightPx = 34;
  range.format.borders = { insideHorizontal: { style: "thin", color: "#D9E1DC" }, bottom: { style: "thin", color: "#B8C8BF" } };
  sheet.freezePanes.freezeRows(1); sheet.freezePanes.freezeColumns(name === "SGF_ICON_DataBase" ? 2 : 1); sheet.showGridLines = false;
  range.format.autofitColumns(); range.format.autofitRows();
  const widths = name === "SGF_ICON_DataBase" ? [120,130,90,145,100,150,140,90,100,65,65,130,110,80]
    : name === "SGF_ICON_Locale" ? [150,70,210,90,90,160,95,190]
    : name === "SGF_ICON_UI_Map" ? [90,130,130,120,180,80,90,220] : [100,120,150,60,60,260];
  widths.forEach((width, index) => { if (index < colCount) sheet.getRangeByIndexes(0, index, rowCount, 1).format.columnWidthPx = width; });
  if (name === "SGF_ICON_DataBase") sheet.getRange(`A2:B${rowCount}`).format.fill = "#E8F0EA";
  if (name === "SGF_ICON_Locale") sheet.getRange(`A2:A${rowCount}`).format.fill = "#E8F0EA";
  if (name === "SGF_ICON_UI_Map") sheet.getRange(`A2:B${rowCount}`).format.fill = "#E8F0EA";
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  await fs.writeFile(path.join(outDir, `${name}.csv`), csv, "utf8");
}

for (const name of Object.keys(sheets)) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: name === "SGF_ICON_DataBase" ? 0.5 : 0.8, format: "png" });
  await fs.writeFile(path.join(outDir, `preview-${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outDir, "SGF_ICON_Tracker_Imported.xlsx"));
console.log(JSON.stringify({ iconRows: iconRows.length, localeRows: localeRows.length, mapRows: mapRows.length, listRows: listRows.length }));
