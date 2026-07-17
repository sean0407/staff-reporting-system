# Staff Reporting System

## 專案背景

這個 repo 是 Logitech Taiwan 駐點人員銷售回報系統。現行主版本使用 Vercel API Routes + Google Sheets API，前端為 `index.html`，資料庫仍是 Google Sheet。

## 現行後端

主後端檔案：

- `lib/sheets.js`：Google Sheets client、環境變數、共用讀寫 helper。
- `api/products.js`：讀 `Price` 工作表。
- `api/stores.js`：讀 `駐點清單` 工作表。
- `api/reports.js`：新增回報與讀取今日回報。
- `api/reports/delete.js`：依 `ID + 姓名 + 店名` 刪除回報。

前端只應呼叫同網域 API：

- `/api/products`
- `/api/stores`
- `/api/reports`
- `/api/reports/delete`

## Google Sheet

預設工作表名稱：

- `Price`
- `駐點清單`
- `回報`
- 平均業績來源：`1jUw-elSYrlIftyuGBcTbUqE5NmUmCMxQRViCdfcQ4uo` 的 `店平均` 工作表

目前切換目標 Sheet ID：

```text
13dERZnpJIrB_H6DfpjVBYNuvYRUfjn-01YzCrALGBuw
```

## Vercel

Production URL：

```text
https://staff-reporting-system-kappa.vercel.app
```

Vercel project：

```text
staff-reporting-system
```

目前 production 已部署並驗證：

- `/`：HTTP 200
- `/api/products`：讀到 682 筆產品
- `/api/stores`：讀到 72 筆門市
- `/api/reports?scope=all`：可讀今日回報
- `/api/reports` + `/api/reports/delete`：暫測資料可寫入並刪除

## 環境變數

必要：

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

或使用：

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

臨時部署可使用：

- `GOOGLE_SHEET_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

可選覆蓋：

- `GOOGLE_PRODUCTS_SHEET`
- `GOOGLE_STORES_SHEET`
- `GOOGLE_REPORTS_SHEET`
- `GOOGLE_STORE_AVERAGE_SHEET_ID`
- `GOOGLE_STORE_AVERAGE_SHEET`

## 檢查方式

```bash
npm install
npm run check
npm audit --omit=dev
```

## 注意事項

- 根目錄不再保留 `GoogleAppsScript.js` 作為主版本；Apps Script 檔案只在 `archive/` 作歷史參考。
- `.gitignore` 不可忽略 `api/`，否則 Vercel 後端不會進 repo。
- 不要提交 `node_modules/`。
- 回報時間延續舊 Apps Script 行為，用台北時間日期做今日統計。
- 沒有固定時間自動清除前端 localStorage 或 Google Sheet 資料；Admin 的 `Clear All 清除全部` 是手動功能，保留。
