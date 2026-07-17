// ============================================
// Google Apps Script - 駐點人員回報系統
// ============================================
//
// 使用方式：
// 1. 開啟 Google Sheet
// 2. 點擊「擴充功能」>「Apps Script」
// 3. 將以下程式碼全部複製貼上
// 4. 儲存並部署為 Web App
// 5. 將部署的 URL 貼到網頁系統中
//

// ============================================
// 設定區 - 請修改為你的 Sheet 名稱
// ============================================
const PRODUCTS_SHEET_NAME = '工作表1';  // 產品資料表單工作表名稱
const REPORTS_SHEET_NAME = '工作表1';   // 回報記錄表單工作表名稱

// ============================================
// API：讀取產品列表
// ============================================
function doGet() {
  return handleRequest();
}

function doPost() {
  return handleRequest();
}

function handleRequest() {
  const params = {
    action: '',
    pn: '',
    name: '',
    store: '',
    note: ''
  };
  
  // 解析請求參數
  if (typeof request !== 'undefined' && request.parameter) {
    params.action = request.parameter.action || '';
    params.pn = request.parameter.pn || '';
    params.name = request.parameter.name || '';
    params.store = request.parameter.store || '';
    params.note = request.parameter.note || '';
  }
  
  // 從 URL 參數讀取
  const urlParams = UrlFetchApp.fetch('https://httpbin.org/get', { muteHttpExceptions: true });
  // 這個方式不行，我們用另一種方式
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'API is running'
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// 讀取產品列表 API
// ============================================
function getProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sheet) {
    return { error: '找不到產品資料表' };
  }
  
  const data = sheet.getDataRange().getValues();
  const products = [];
  
  // 跳過標題列，從第二行開始
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {  // 如果有 PN 碼
      products.push({
        pn: String(row[0]).trim(),
        name: row[1] ? String(row[1]).trim() : '',
        spec: row[2] ? String(row[2]).trim() : '',
        category: row[3] ? String(row[3]).trim() : ''
      });
    }
  }
  
  return products;
}

// ============================================
// 寫入回報 API
// ============================================
function addReport(reportData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTS_SHEET_NAME);
  if (!sheet) {
    return { error: '找不到回報資料表' };
  }
  
  const timestamp = new Date().toLocaleString('zh-TW');
  
  // 新增資料到最後一行
  sheet.appendRow([
    timestamp,           // 時間戳記
    reportData.name,     // 姓名
    reportData.store,    // 店名
    reportData.pn,       // PN 碼
    reportData.productName, // 產品名稱
    reportData.note      // 備註
  ]);
  
  return { status: 'success', message: '回報已儲存' };
}

// ============================================
// Web API 處理
// ============================================
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'getProducts') {
      // 讀取產品列表
      const products = getProducts();
      return JsonService.createTextOutput(JSON.stringify(products))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else if (action === 'addReport') {
      // 新增回報
      const reportData = {
        name: e.parameter.name,
        store: e.parameter.store,
        pn: e.parameter.pn,
        productName: e.parameter.productName,
        note: e.parameter.note
      };
      const result = addReport(reportData);
      return JsonService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    else {
      return JsonService.createTextOutput(JSON.stringify({
        status: 'ok',
        message: '駐點人員回報系統 API',
        endpoints: {
          getProducts: '?action=getProducts',
          addReport: '?action=addReport&name=...&store=...&pn=...&productName=...&note=...'
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    return JsonService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// 部署說明
// ============================================
/*
部署步驟：

1. 開啟 Google Sheet

2. 點擊「擴充功能」>「Apps Script」

3. 刪除所有預設程式碼，然後複製上面的程式碼貼上

4. 點擊「儲存」圖示 💾

5. 點擊「部署」>「新增部署作業」

6. 選擇類型：「網路應用程式」

7. 設定：
   - 說明：駐點人員回報系統 API
   - 執行身份：me (本人)
   - 誰可以存取：任何人

8. 點擊「部署」

9. 複製「網路應用程式」網址

10. 將這個網址貼到網頁系統中
*/
