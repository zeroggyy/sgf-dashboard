/**
 * SGF 專案進度看板 Google Apps Script API
 * 
 * 使用方法：
 * 1. 在您的 Google Sheet 中，點擊上方選單的「擴充功能」 -> 「Apps Script」。
 * 2. 清空原本的程式碼，將此檔案的所有內容貼進去。
 * 3. 點擊上方的「儲存」圖示。
 * 4. 點擊右上角的「部署」 -> 「新增部署」。
 * 5. 類型選擇「網頁應用程式 (Web App)」。
 * 6. 設定：
 *    - 說明：SGF Dashboard API
 *    - 執行身分：您本人 (Me)
 *    - 誰有權限存取：所有人 (Anyone) -> 註：別擔心，我們會透過 API_KEY 來保護安全。
 * 7. 點擊「部署」，並授權存取。
 * 8. 複製產生的「網頁應用程式 URL」，這就是您的 API 網址，請將它填入網頁的設定中。
 */
// 安全金鑰設定，請修改為您自訂的複雜字串，並在網頁 app.js 中填寫相同的金鑰
const API_KEY = "SGF_SECURE_TOKEN_2026";
/**
 * 處理 GET 請求：讀取試算表資料並轉為 JSON 格式
 */
function doGet(e) {
  try {
    // 驗證 API 金鑰
    if (!validateAuth(e)) {
      return jsonResponse({ error: "Unauthorized: Invalid API Key" }, 401);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Task");
    
    if (!sheet) {
      return jsonResponse({ error: "找不到名稱為 'Task' 的分頁，請確認分頁名稱是否正確。" }, 404);
    }
    
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return jsonResponse({ error: "No data found in sheet" });
    }
    // 取得標頭列：
    // 第一列 (data[0]) 包含: SGF_#規格文件總表, W27, W28, W29...
    // 第二列 (data[1]) 包含: 完成, 專案項目, 主, 目標 (需要文件), 完成度, 以及各週的日期 (06/29 - 07/05...)
    const row0 = data[0] || [];
    const row1 = data[1] || [];
    
    const headers = [];
    const weekCols = []; // 儲存週別資訊 { index: 數字, label: "W27", date: "06/29 - 07/05" }
    
    // 遍歷所有欄位
    for (let colIdx = 0; colIdx < Math.max(row0.length, row1.length); colIdx++) {
      const val0 = row0[colIdx] ? row0[colIdx].toString().trim() : "";
      const val1 = row1[colIdx] ? row1[colIdx].toString().trim() : "";
      
      // 判定是否為週別欄位：第一列是 W27 形式
      if (val0.match(/^[Ww]\s*\d+/)) {
        headers.push(val0);
        weekCols.push({
          index: colIdx,
          label: val0,
          date: val1 // 第二列的日期存起來作為輔助
        });
      } else {
        // 非週別欄位，優先使用第二列的具體名稱 (例如 "完成"、"專案項目"、"目標 (需要文件)")
        // 如果第二列為空，則使用第一列的值
        headers.push(val1 || val0);
      }
    }
    // 尋找關鍵欄位索引 (使用修改後的 headers 尋找)
    const doneIdx = headers.indexOf("完成");
    const taskIdx = headers.indexOf("專案項目");
    const ownerIdx = headers.indexOf("主");
    const detailIdx = headers.indexOf("目標 (需要文件)");
    const progressIdx = headers.indexOf("完成度");
    
    let idIdx = headers.indexOf("ID");
    if (idIdx === -1) {
      idIdx = taskIdx > 0 ? taskIdx - 1 : 1; // 預設定位在專案項目欄的前一格 (B欄)
    }
    const tasks = [];
    let currentGroup = "未分類";
    // 從第三列開始解析資料
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      let taskName = row[taskIdx] ? row[taskIdx].toString().trim() : "";
      if (!taskName) continue;
      // 若為公式，解析出實際的顯示名稱，並提取超連結
      const cellRange = sheet.getRange(i + 1, taskIdx + 1);
      if (taskName.startsWith("=")) {
        taskName = cellRange.getValue().toString().trim();
      }
      let taskLink = "";
      const richTextLink = cellRange.getRichTextValue().getLinkUrl();
      if (richTextLink) {
        taskLink = richTextLink;
      } else {
        const formula = cellRange.getFormula();
        if (formula && formula.toUpperCase().indexOf("HYPERLINK") !== -1) {
          const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
          if (match) taskLink = match[1];
        }
      }
      // 判斷是否為「大分類/分組」 (例如：02 // 02_角色動作編輯)
      // 特徵：主、目標欄位可能為空，或者任務名稱包含 //
      if (taskName.includes("//") || (!row[ownerIdx] && !row[progressIdx] && taskName.match(/^\d+/))) {
        currentGroup = taskName;
        continue;
      }
      // 解析週進度
      const weeksData = {};
      weekCols.forEach(col => {
        weeksData[col.label] = row[col.index] ? row[col.index].toString().trim() : "";
      });
      // 解析進度百分比
      let progressVal = 0;
      if (row[progressIdx] !== "") {
        const rawProgress = row[progressIdx].toString();
        progressVal = parseFloat(rawProgress);
        if (rawProgress.includes("%")) {
          // 已經是百分比格式
        } else if (progressVal <= 1 && progressVal > 0) {
          // 小數格式 (例如 0.67 代表 67%)
          progressVal = Math.round(progressVal * 100);
        }
      }
      tasks.push({
        rowNumber: i + 1, // 記錄對應的試算表行數，以便更新
        group: currentGroup,
        isDone: row[doneIdx] === true || row[doneIdx] === "TRUE" || progressVal === 100,
        taskId: row[idIdx] ? row[idIdx].toString().trim() : "", // B 欄的 ID 內容
        taskName: taskName,
        taskLink: taskLink, // 傳送專案超連結 URL
        owner: row[ownerIdx] ? row[ownerIdx].toString().trim() : "未分配",
        detail: row[detailIdx] ? row[detailIdx].toString().trim() : "",
        progress: progressVal,
        weeks: weeksData
      });
    }
    // 讀取「時程」分頁資料
    const milestones = [];
    const scheduleSheet = ss.getSheetByName("時程");
    if (scheduleSheet) {
      const scheduleData = scheduleSheet.getDataRange().getValues();
      // 從第二列 (索引 1) 開始，跳過標題
      for (let i = 1; i < scheduleData.length; i++) {
        const row = scheduleData[i];
        if (row.length < 6) continue;
        
        const dateVal = row[2]; // C 欄 (索引 2)
        const dayVal = row[3];  // D 欄 (索引 3)
        const targetVal = row[5]; // F 欄 (索引 5)
        
        // 格式化日期：如果是 Date 物件，轉為 YYYY/MM/DD 字串
        let dateStr = "";
        if (dateVal instanceof Date) {
          const y = dateVal.getFullYear();
          const m = ("0" + (dateVal.getMonth() + 1)).slice(-2);
          const d = ("0" + dateVal.getDate()).slice(-2);
          dateStr = y + "/" + m + "/" + d;
        } else if (dateVal) {
          dateStr = dateVal.toString().trim();
          // 如果是試算表讀出的某些特定日期字串格式，做輕微規整
          if (dateStr.indexOf("T") !== -1) {
            dateStr = dateStr.split("T")[0].replace(/-/g, "/");
          }
        }
        
        const dayStr = dayVal ? dayVal.toString().trim() : "";
        const targetStr = targetVal ? targetVal.toString().trim() : "";
        
        if (dateStr) {
          milestones.push({
            rowNumber: i + 1, // 試算表上的實際行數
            date: dateStr,
            day: dayStr,
            target: targetStr
          });
        }
      }
    }
    return jsonResponse({ tasks: tasks, milestones: milestones, weeksList: weekCols });
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}
/**
 * 處理 POST 請求：更新特定任務的進度或備忘錄
 */
function doPost(e) {
  try {
    // 驗證 API 金鑰
    if (!validateAuth(e)) {
      return jsonResponse({ error: "Unauthorized: Invalid API Key" }, 401);
    }
    let postData;
    try {
      postData = JSON.parse(e.postData.contents);
    } catch(err) {
      return jsonResponse({ error: "Invalid JSON format in request body" }, 400);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // 處理新建任務行為 (不用 rowNumber)
    if (postData.action === "createTask") {
      const sheet = ss.getSheetByName("Task");
      if (!sheet) {
        return jsonResponse({ error: "找不到名稱為 'Task' 的分頁" }, 404);
      }
      
      // 取得合併標頭列 (合併第一列週別與第二列欄位名稱)
      const row0 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const row1 = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
      const headers = [];
      for (let colIdx = 0; colIdx < Math.max(row0.length, row1.length); colIdx++) {
        const val0 = row0[colIdx] ? row0[colIdx].toString().trim() : "";
        const val1 = row1[colIdx] ? row1[colIdx].toString().trim() : "";
        if (val0.match(/^[Ww]\s*\d+/)) {
          headers.push(val0);
        } else {
          headers.push(val1 || val0);
        }
      }

      const newRowValues = new Array(headers.length).fill("");
      
      const doneIdx = headers.indexOf("完成");
      const taskIdx = headers.indexOf("專案項目");
      const ownerIdx = headers.indexOf("主");
      const detailIdx = headers.indexOf("目標 (需要文件)");
      const progressIdx = headers.indexOf("完成度");
      
      // 若 header 裡找不到寫著 "ID" 的字樣，採用與 doGet 一致的預設計算 (即 C 欄專案項目的前一欄 B 欄)
      let idIdx = headers.indexOf("ID");
      if (idIdx === -1) {
        idIdx = taskIdx > 0 ? taskIdx - 1 : 1; 
      }
      
      if (idIdx !== -1 && postData.taskId !== undefined) {
        newRowValues[idIdx] = postData.taskId;
      }
      if (ownerIdx !== -1 && postData.owner !== undefined) {
        newRowValues[ownerIdx] = postData.owner;
      }
      if (detailIdx !== -1 && postData.detail !== undefined) {
        newRowValues[detailIdx] = postData.detail;
      }
      
      // 寫入試算表最後一行
      sheet.appendRow(newRowValues);
      const lastRowNum = sheet.getLastRow();
      
      // A欄 (完成欄) 統一加上核取方塊
      if (doneIdx !== -1) {
        const doneCell = sheet.getRange(lastRowNum, doneIdx + 1);
        doneCell.insertCheckboxes();
        doneCell.setValue(false); // 預設為未勾選
      }
      // 自動複製並沿用前一行所有有公式單元格的公式 (例如完成度公式、或 J 欄週進度公式等)
      const prevRowFormulas = sheet.getRange(lastRowNum - 1, 1, 1, headers.length).getFormulas()[0];
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        if (prevRowFormulas[colIdx]) {
          const sourceCell = sheet.getRange(lastRowNum - 1, colIdx + 1);
          const targetCell = sheet.getRange(lastRowNum, colIdx + 1);
          sourceCell.copyTo(targetCell, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
        }
      }
      
      // 處理專案項目名稱與超連結公式
      if (taskIdx !== -1) {
        const cell = sheet.getRange(lastRowNum, taskIdx + 1);
        const name = (postData.taskName || "").trim();
        const link = (postData.taskLink || "").trim();
        
        if (link === "") {
          cell.setValue(name);
        } else {
          cell.setFormula(`=HYPERLINK("${link}", "${name}")`);
        }
      }
      
      // 批次寫入新任務各週進度 (僅在該週別欄位並非公式的情況下才允許寫入，以免破壞公式)
      if (postData.weeks && typeof postData.weeks === 'object') {
        for (const [weekKey, weekValue] of Object.entries(postData.weeks)) {
          const weekIdx = headers.indexOf(weekKey) + 1;
          if (weekIdx > 0) {
            if (!prevRowFormulas[weekIdx - 1]) {
              sheet.getRange(lastRowNum, weekIdx).setValue(weekValue);
            }
          }
        }
      }
      
      return jsonResponse({ success: true, message: "任務已成功新增！", rowNumber: lastRowNum });
    }
    const rowNumber = parseInt(postData.rowNumber);
    if (!rowNumber || isNaN(rowNumber)) {
      return jsonResponse({ error: "Missing or invalid rowNumber" }, 400);
    }
    // 時程分頁里程碑的就地更新寫回 (F 欄是第 6 欄)
    if (postData.action === "updateMilestone") {
      const scheduleSheet = ss.getSheetByName("時程");
      if (!scheduleSheet) {
        return jsonResponse({ error: "找不到名稱為 '時程' 的分頁" }, 404);
      }
      scheduleSheet.getRange(rowNumber, 6).setValue(postData.target || "");
      return jsonResponse({ success: true, message: "里程碑已成功更新！" });
    }
    const sheet = ss.getSheetByName("Task");
    
    if (!sheet) {
      return jsonResponse({ error: "找不到名稱為 'Task' 的分頁" }, 404);
    }
    
    // 取得與 doGet 一致的合併標頭列 (合併第一列週別與第二列欄位名稱)
    const row0 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row1 = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = [];
    for (let colIdx = 0; colIdx < Math.max(row0.length, row1.length); colIdx++) {
      const val0 = row0[colIdx] ? row0[colIdx].toString().trim() : "";
      const val1 = row1[colIdx] ? row1[colIdx].toString().trim() : "";
      if (val0.match(/^[Ww]\s*\d+/)) {
        headers.push(val0);
      } else {
        headers.push(val1 || val0);
      }
    }

    // 更新完成度與核取方塊
    if (postData.progress !== undefined) {
      const progressIdx = headers.indexOf("完成度") + 1;
      const doneIdx = headers.indexOf("完成") + 1;
      const progressPercent = parseFloat(postData.progress) / 100;
      
      if (progressIdx > 0) {
        sheet.getRange(rowNumber, progressIdx).setValue(progressPercent);
      }
      if (doneIdx > 0) {
        // 若進度 100% 則勾選完成，否則取消勾選
        sheet.getRange(rowNumber, doneIdx).setValue(progressPercent === 1);
      }
    }
    // 獨立更新 A 欄的完成狀態 (核取方塊)，不影響 E 欄公式
    if (postData.isDone !== undefined) {
      const doneIdx = headers.indexOf("完成") + 1;
      if (doneIdx > 0) {
        const checkVal = postData.isDone === true || postData.isDone === "true";
        sheet.getRange(rowNumber, doneIdx).setValue(checkVal);
      }
    }
    // 更新專案項目名稱 (B 欄) 與 超連結，確保超連結公式與名稱可獨立或合併更新
    if (postData.taskName !== undefined || postData.taskLink !== undefined) {
      const taskIdx = headers.indexOf("專案項目") + 1;
      if (taskIdx > 0) {
        const cell = sheet.getRange(rowNumber, taskIdx);
        let name = postData.taskName !== undefined ? postData.taskName.trim() : cell.getValue().toString().trim();
        
        let link = "";
        if (postData.taskLink !== undefined) {
          link = postData.taskLink.trim();
        } else {
          const formula = cell.getFormula();
          if (formula && formula.toUpperCase().indexOf("HYPERLINK") !== -1) {
            const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
            if (match) link = match[1];
          }
        }
        if (link === "") {
          cell.setValue(name); // 清除連結，還原為純文字
        } else {
          cell.setFormula(`=HYPERLINK("${link}", "${name}")`); // 寫入超連結公式
        }
      }
    }
    // 更新 ID (B 欄)
    if (postData.taskId !== undefined) {
      const taskIdx = headers.indexOf("專案項目") + 1;
      const idIdx = headers.indexOf("ID") !== -1 ? headers.indexOf("ID") + 1 : (taskIdx > 1 ? taskIdx - 1 : 2);
      if (idIdx > 0) {
        sheet.getRange(rowNumber, idIdx).setValue(postData.taskId);
      }
    }
    // 更新主負責人 (C 欄)
    if (postData.owner !== undefined) {
      const ownerIdx = headers.indexOf("主") + 1;
      if (ownerIdx > 0) {
        sheet.getRange(rowNumber, ownerIdx).setValue(postData.owner);
      }
    }
    // 更新備忘錄目標內容
    if (postData.detail !== undefined) {
      const detailIdx = headers.indexOf("目標 (需要文件)") + 1;
      if (detailIdx > 0) {
        sheet.getRange(rowNumber, detailIdx).setValue(postData.detail);
      }
    }
    // 批次更新特定週的狀態
    if (postData.weeks && typeof postData.weeks === 'object') {
      for (const [weekKey, weekValue] of Object.entries(postData.weeks)) {
        const weekIdx = headers.indexOf(weekKey) + 1;
        if (weekIdx > 0) {
          sheet.getRange(rowNumber, weekIdx).setValue(weekValue);
        }
      }
    }
    return jsonResponse({ success: true, message: "Row " + rowNumber + " updated successfully" });
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}
/**
 * 輔助函式：驗證 API 金鑰安全
 */
function validateAuth(e) {
  let token = "";
  if (e.parameter && e.parameter.key) {
    token = e.parameter.key;
  }
  return token === API_KEY;
}
/**
 * 輔助函式：產生含有 CORS 標頭的 JSON 回應
 */
function jsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  // Apps Script Web App 對於 CORS 的支援通常是自動的，
  // 但回傳 JSON 格式可以讓前端 fetch 順暢解析。
  return output;
}
