import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outDir = path.resolve("icon-tracker-sample");
await fs.mkdir(outDir, { recursive: true });

const sheets = {
  SGF_ICON_DataBase: [
    ["Icon ID","群組 ID","類型","子類型","內部名稱","顯示名稱 Key","規格處理方式","主要尺寸","其他尺寸","格式","多狀態","狀態種類","目前階段","負責人","企劃規格完成","美術草稿完成","草稿確認完成","美術完稿完成","輸出切圖完成","程式整合完成","遊戲內確認完成","退回修改中","退回原因","需求圖連結","預覽圖連結","來源檔路徑","輸出路徑","檔名","需求日","目標日","最終確認日","備註"],
    ["ICON-WEAPON-001","GRP-WEAPON-TYPE","武器","武器種類","broadsword","icon.weapon.broadsword","單一圖檔多尺寸","64×64","128×128","PNG",false,"","已結案","美術A",true,true,true,true,true,true,true,false,"","","https://gyazo.com/example_weapon_001","\\\\Server02\\sgf\\00_DevTeamShare\\介面圖稿\\SGF_UI\\@icon\\武器種類","Assets/UI/Icon/Weapon","icon_weapon_broadsword.png","2026-07-01","2026-07-15","2026-07-14","原表：大刀"],
    ["ICON-WEAPON-002","GRP-WEAPON-TYPE","武器","武器種類","great_sword","icon.weapon.great_sword","單一圖檔多尺寸","64×64","128×128","PNG",false,"","已結案","美術A",true,true,true,true,true,true,true,false,"","","","\\\\Server02\\sgf\\00_DevTeamShare\\介面圖稿\\SGF_UI\\@icon\\武器種類","Assets/UI/Icon/Weapon","icon_weapon_great_sword.png","2026-07-01","2026-07-15","2026-07-14","原表：大劍"],
    ["ICON-WEAPON-003","GRP-WEAPON-TYPE","武器","武器種類","snake_spear","icon.weapon.snake_spear","單一圖檔多尺寸","64×64","128×128","PNG",false,"","已結案","美術A",true,true,true,true,true,true,true,false,"","","","\\\\Server02\\sgf\\00_DevTeamShare\\介面圖稿\\SGF_UI\\@icon\\武器種類","Assets/UI/Icon/Weapon","icon_weapon_snake_spear.png","2026-07-01","2026-07-15","2026-07-14","原表：蛇矛"],
    ["ICON-WEAPON-004","GRP-WEAPON-TYPE","武器","武器種類","iron_fist","icon.weapon.iron_fist","單一圖檔多尺寸","64×64","128×128","PNG",false,"","待美術草稿","美術B",true,false,false,false,false,false,false,false,"","","","\\\\Server02\\sgf\\00_DevTeamShare\\介面圖稿\\SGF_UI\\@icon\\武器種類","Assets/UI/Icon/Weapon","icon_weapon_iron_fist.png","2026-08-10","2026-08-24","","原表：鐵拳"],
    ["ICON-PORTRAIT-001","GRP-PORTRAIT-SPINE","頭像","武將頭像","dong_zhuo","icon.hero.dong_zhuo","編輯器自動產生","自動切圖","","PNG",false,"","不適用","程式A",true,false,false,false,false,true,true,false,"","","","","Editor/Portrait/Generated","portrait_dong_zhuo.png","2026-07-01","2026-07-15","2026-07-15","由 Spine 對位與編輯器自動切圖，不追蹤美術輸出"],
    ["ICON-SCENE-001","GRP-SCENE-LARGE","場景","大型場景 Icon","mountain_fort","icon.scene.mountain_fort","各尺寸分別驗收","512×128","2048×1024","PNG",false,"","已結案","美術C",true,true,true,true,true,true,true,false,"","","","","Assets/UI/Icon/Scene","icon_scene_mountain_fort.png","2026-07-10","2026-07-25","2026-07-24","原表：山寨"],
    ["ICON-MOBILE-ATTACK","GRP-MOBILE-CONTROL","操作按鍵","手機按鍵","attack","icon.control.attack","各尺寸分別驗收","200×200","64×64","PNG",true,"正常、按下、禁用","待遊戲內確認","程式B",true,true,true,true,true,true,false,false,"","","https://gyazo.com/example_attack","","Assets/UI/Icon/Mobile","icon_mobile_attack.png","2026-08-01","2026-08-20","","200×200 手機按鍵；64×64 招式表顯示"],
    ["ICON-STATUS-POISON","GRP-BATTLE-STATUS","狀態圖示","負面狀態","poison","icon.status.poison","單一圖檔多狀態","64×64","32×32","PNG",true,"正常、疊層、禁用","待美術完稿","美術B",true,true,true,false,false,false,false,false,"","","","","Assets/UI/Icon/Status","icon_status_poison.png","2026-08-12","2026-08-28","","示範新增的狀態圖示需求"]
  ],
  SGF_ICON_Locale: [
    ["Text Key","語言","顯示文字","翻譯狀態","需要語系圖","語系圖連結","最後確認日","備註"],
    ["icon.weapon.broadsword","zh-TW","大刀","已確認",false,"","2026-07-10",""],
    ["icon.weapon.broadsword","zh-CN","大刀","已確認",false,"","2026-07-10",""],
    ["icon.weapon.broadsword","en","Broadsword","已確認",false,"","2026-07-12",""],
    ["icon.weapon.broadsword","ja","大刀","待確認",false,"","",""],
    ["icon.weapon.broadsword","ko","대도","待翻譯",false,"","",""],
    ["icon.weapon.great_sword","zh-TW","大劍","已確認",false,"","2026-07-10",""],
    ["icon.weapon.great_sword","zh-CN","大剑","已確認",false,"","2026-07-10",""],
    ["icon.weapon.great_sword","en","Great Sword","已確認",false,"","2026-07-12",""],
    ["icon.weapon.great_sword","ja","大剣","待確認",false,"","",""],
    ["icon.weapon.great_sword","ko","대검","待翻譯",false,"","",""],
    ["icon.hero.dong_zhuo","zh-TW","董卓","已確認",false,"","2026-07-10","純圖示，翻譯供搜尋與替代文字使用"],
    ["icon.hero.dong_zhuo","zh-CN","董卓","已確認",false,"","2026-07-10",""],
    ["icon.hero.dong_zhuo","en","Dong Zhuo","已確認",false,"","2026-07-12",""],
    ["icon.hero.dong_zhuo","ja","董卓","待確認",false,"","",""],
    ["icon.hero.dong_zhuo","ko","동탁","待確認",false,"","",""],
    ["icon.control.attack","zh-TW","攻擊","已確認",false,"","2026-08-01","按鍵內不含文字"],
    ["icon.control.attack","zh-CN","攻击","已確認",false,"","2026-08-01",""],
    ["icon.control.attack","en","Attack","已確認",false,"","2026-08-01",""],
    ["icon.control.attack","ja","攻撃","待確認",false,"","",""],
    ["icon.control.attack","ko","공격","待確認",false,"","",""],
    ["icon.status.poison","zh-TW","中毒","已確認",false,"","2026-08-12",""],
    ["icon.status.poison","zh-CN","中毒","已確認",false,"","2026-08-12",""],
    ["icon.status.poison","en","Poison","待確認",false,"","",""],
    ["icon.status.poison","ja","毒","待翻譯",false,"","",""],
    ["icon.status.poison","ko","중독","待翻譯",false,"","",""]
  ],
  SGF_ICON_UI_Map: [
    ["關聯 ID","Icon ID","UI 項目 ID","UI 機制","使用位置","是否必要","使用狀態","備註"],
    ["MAP-0001","ICON-WEAPON-001","UI-BATTLE-003","戰鬥介面","武器切換列",true,"使用中",""],
    ["MAP-0002","ICON-WEAPON-001","UI-CHAR-012","角色介面","角色裝備頁",true,"使用中",""],
    ["MAP-0003","ICON-PORTRAIT-001","UI-HERO-001","武將介面","武將列表與詳情",true,"使用中","編輯器自動切圖"],
    ["MAP-0004","ICON-SCENE-001","UI-MODE-001","模式選擇","場景入口卡片",true,"使用中",""],
    ["MAP-0005","ICON-MOBILE-ATTACK","UI-BATTLE-MOBILE","戰鬥介面","手機版攻擊按鍵",true,"待確認","需要遊戲內截圖"],
    ["MAP-0006","ICON-MOBILE-ATTACK","UI-SKILL-LIST","招式表","招式表攻擊類型",true,"待確認","使用 64×64 輸出"],
    ["MAP-0007","ICON-STATUS-POISON","UI-BATTLE-HUD","戰鬥介面","HUD 狀態列",true,"待製作",""],
    ["MAP-0008","ICON-STATUS-POISON","UI-CHAR-STATUS","角色介面","角色狀態詳情",false,"待製作",""]
  ],
  SGF_ICON_Lists: [
    ["清單類型","代碼","顯示值","排序","啟用","說明"],
    ["Icon類型","portrait","頭像",1,true,"角色或武將頭像"],
    ["Icon類型","weapon","武器",2,true,"武器種類與武器狀態"],
    ["Icon類型","skill","技能",3,true,"技能與招式"],
    ["Icon類型","status","狀態圖示",4,true,"增益、減益與系統狀態"],
    ["Icon類型","item","道具",5,true,"消耗品、材料與裝備"],
    ["Icon類型","currency","貨幣",6,true,"遊戲貨幣與點數"],
    ["Icon類型","rank","段位",7,true,"段位與聯賽標誌"],
    ["Icon類型","scene","場景",8,true,"場景與模式入口"],
    ["Icon類型","control","操作按鍵",9,true,"鍵鼠、手把與手機按鍵"],
    ["製作階段","planning","待企劃規格",1,true,"目前由企劃補齊規格"],
    ["製作階段","draft","待美術草稿",2,true,"目前由美術製作草稿"],
    ["製作階段","draft_review","待企劃確認草稿",3,true,"目前由企劃確認草稿"],
    ["製作階段","final_art","待美術完稿",4,true,"目前由美術製作正式稿"],
    ["製作階段","export","待輸出切圖",5,true,"等待尺寸、格式與命名輸出"],
    ["製作階段","integration","待程式整合",6,true,"等待匯入遊戲或編輯器"],
    ["製作階段","game_review","待遊戲內確認",7,true,"等待遊戲內視覺與操作確認"],
    ["製作階段","returned","退回處理中",8,true,"依退回原因修正"],
    ["製作階段","completed","已結案",9,true,"最終確認完成"],
    ["製作階段","not_applicable","不適用",10,true,"由工具自動產生或不追蹤"],
    ["翻譯狀態","todo","待翻譯",1,true,""],
    ["翻譯狀態","translating","翻譯中",2,true,""],
    ["翻譯狀態","review","待確認",3,true,""],
    ["翻譯狀態","confirmed","已確認",4,true,""],
    ["翻譯狀態","na","不適用",5,true,""],
    ["語言","zh-TW","繁體中文",1,true,""],
    ["語言","zh-CN","簡體中文",2,true,""],
    ["語言","en","英文",3,true,""],
    ["語言","ja","日文",4,true,""],
    ["語言","ko","韓文",5,true,""]
  ]
};

const csvEscape = value => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const workbook = Workbook.create();
const headerFill = "#456B5A";
const headerFont = "#FFFFFF";
const accentFill = "#E8F0EA";

for (const [name, rows] of Object.entries(sheets)) {
  const sheet = workbook.worksheets.add(name);
  const rowCount = rows.length;
  const colCount = rows[0].length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  range.values = rows;
  range.format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center" };
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = { fill: headerFill, font: { bold: true, color: headerFont, name: "Arial", size: 10 }, wrapText: true, verticalAlignment: "center" };
  header.format.rowHeightPx = 34;
  range.format.borders = { insideHorizontal: { style: "thin", color: "#D9E1DC" }, bottom: { style: "thin", color: "#B8C8BF" } };
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(name === "SGF_ICON_DataBase" ? 2 : 1);
  sheet.showGridLines = false;
  range.format.autofitColumns();
  range.format.autofitRows();
  const widths = name === "SGF_ICON_DataBase"
    ? [120,130,90,110,130,180,140,85,95,65,65,140,120,85]
    : name === "SGF_ICON_Locale" ? [190,70,150,95,90,180,100,220]
    : name === "SGF_ICON_UI_Map" ? [90,145,145,110,170,80,95,220]
    : [100,120,150,60,60,260];
  widths.forEach((width, index) => { if (index < colCount) sheet.getRangeByIndexes(0, index, rowCount, 1).format.columnWidthPx = width; });
  if (name === "SGF_ICON_DataBase") {
    sheet.getRange(`N2:V${rowCount}`).format.horizontalAlignment = "center";
    sheet.getRange(`AC2:AE${rowCount}`).format.numberFormat = "yyyy-mm-dd";
    sheet.getRange(`A2:B${rowCount}`).format.fill = accentFill;
  } else if (name === "SGF_ICON_Locale") {
    sheet.getRange(`A2:A${rowCount}`).format.fill = accentFill;
  } else if (name === "SGF_ICON_UI_Map") {
    sheet.getRange(`A2:B${rowCount}`).format.fill = accentFill;
  }
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  await fs.writeFile(path.join(outDir, `${name}.csv`), csv, "utf8");
}

for (const name of Object.keys(sheets)) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(outDir, `preview-${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outDir, "SGF_ICON_Tracker_Sample.xlsx"));

const inspect = await workbook.inspect({ kind: "sheet,table", maxChars: 5000, tableMaxRows: 4, tableMaxCols: 8 });
console.log(inspect.ndjson);
