import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const sourceDir = path.resolve("icon-tracker-sample", "simplified-3-sheets");
const outDir = path.resolve("icon-tracker-sample", "final-2-sheets");
await fs.mkdir(outDir, { recursive: true });

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
const toObjects = rows => {
  const headers = rows[0].map(value => String(value).replace(/^\uFEFF/, ""));
  return rows.slice(1).filter(row => row.some(value => String(value).trim())).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
};

const db = toObjects(parseCsv(await fs.readFile(path.join(sourceDir, "SGF_ICON_DataBase.csv"), "utf8")));
const locale = toObjects(parseCsv(await fs.readFile(path.join(sourceDir, "SGF_ICON_Locale.csv"), "utf8")));
const map = toObjects(parseCsv(await fs.readFile(path.join(sourceDir, "SGF_ICON_UI_Map.csv"), "utf8")));

const mapsByIcon = new Map();
for (const relation of map) {
  if (!mapsByIcon.has(relation["Icon ID"])) mapsByIcon.set(relation["Icon ID"], []);
  mapsByIcon.get(relation["Icon ID"]).push(relation);
}
const joinUnique = (relations, field) => [...new Set(relations.map(item => item[field]).filter(Boolean))].join("\n");
const usageNotes = relations => relations.map(item => {
  const position = item["使用位置"] || item["UI 機制"] || "";
  const detail = [item["使用狀態"], item["備註"]].filter(Boolean).join("；");
  return detail ? `${position}：${detail}` : "";
}).filter(Boolean).join("\n");

const dbHeaders = ["Icon ID","類型","子類型","項目名稱","檔名","主要尺寸","其他尺寸","格式","多狀態","狀態種類","規格處理方式","UI 機制","使用位置","使用備註","目前階段","負責人","企劃需求完成","美術完稿完成","輸出切圖完成","企劃驗收完成","退回修改中","退回原因","需求圖連結","預覽圖連結","來源檔路徑","輸出路徑","需求日","目標日","最終確認日","備註"];
const dbRows = db.map(item => {
  const relations = mapsByIcon.get(item["Icon ID"]) || [];
  return [item["Icon ID"],item["類型"],item["子類型"],item["項目名稱"],item["檔名"],item["主要尺寸"],item["其他尺寸"],item["格式"],item["多狀態"],item["狀態種類"],item["規格處理方式"],joinUnique(relations,"UI 機制"),joinUnique(relations,"使用位置"),usageNotes(relations),item["目前階段"],item["負責人"],item["企劃需求完成"],item["美術完稿完成"],item["輸出切圖完成"],item["企劃驗收完成"],item["退回修改中"],item["退回原因"],item["需求圖連結"],item["預覽圖連結"],item["來源檔路徑"],item["輸出路徑"],item["需求日"],item["目標日"],item["最終確認日"],item["備註"]];
});

const localeHeaders = ["Icon ID","語言","顯示文字","翻譯狀態","語系圖完成","語系圖連結","最後確認日","備註"];
const localeRows = locale.map(item => [item["Icon ID"],item["語言"],item["顯示文字"],item["翻譯狀態"],item["語系圖完成"],item["語系圖連結"],item["最後確認日"],item["備註"]]);
const sheets = { SGF_ICON_DataBase: [dbHeaders, ...dbRows], SGF_ICON_Locale: [localeHeaders, ...localeRows] };

const csvEscape = value => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const workbook = Workbook.create();
for (const [name, rows] of Object.entries(sheets)) {
  rows.forEach((row, index) => { if (row.length !== rows[0].length) throw new Error(`${name} row ${index + 1} column mismatch`); });
  const sheet = workbook.worksheets.add(name); const rowCount = rows.length; const colCount = rows[0].length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount); range.values = rows;
  range.format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center" };
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = { fill: "#456B5A", font: { bold: true, color: "#FFFFFF", name: "Arial", size: 10 }, wrapText: true, verticalAlignment: "center" }; header.format.rowHeightPx = 34;
  range.format.borders = { insideHorizontal: { style: "thin", color: "#D9E1DC" }, bottom: { style: "thin", color: "#B8C8BF" } };
  sheet.freezePanes.freezeRows(1); sheet.freezePanes.freezeColumns(name === "SGF_ICON_DataBase" ? 2 : 1); sheet.showGridLines = false;
  range.format.autofitColumns(); range.format.autofitRows();
  const widths = name === "SGF_ICON_DataBase" ? [120,90,140,150,170,90,100,65,65,130,130,130,160,230,110,85]
    : [130,70,210,90,90,160,95,190];
  widths.forEach((width, index) => { if (index < colCount) sheet.getRangeByIndexes(0, index, rowCount, 1).format.columnWidthPx = width; });
  sheet.getRange(`A2:A${rowCount}`).format.fill = "#E8F0EA";
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  await fs.writeFile(path.join(outDir, `${name}.csv`), csv, "utf8");
}
for (const name of Object.keys(sheets)) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: name === "SGF_ICON_DataBase" ? 0.5 : 0.8, format: "png" });
  await fs.writeFile(path.join(outDir, `preview-${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const xlsx = await SpreadsheetFile.exportXlsx(workbook); await xlsx.save(path.join(outDir, "SGF_ICON_Tracker_2_Sheets.xlsx"));
const check = await workbook.inspect({ kind: "sheet,table", maxChars: 2200, tableMaxRows: 3, tableMaxCols: 14 }); console.log(check.ndjson);
