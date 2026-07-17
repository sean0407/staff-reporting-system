# Staff Reporting System

駐點人員銷售回報系統。現行版本使用 Vercel API Routes 讀寫 Google Sheets，不再依賴 Google Apps Script。

## 架構

```text
index.html
  -> /api/products
  -> /api/stores
  -> /api/reports
  -> /api/reports/delete
  -> Google Sheets API
  -> Google Sheet
```

## Google Sheet 結構

目前後端預設讀寫這 3 張工作表：

### Price

| 欄位 | 用途 |
|------|------|
| A: P/N | 產品 PN |
| B: NAME | 產品名稱 |
| C: 品類 | 產品分類 |
| D: PN+品名 | 比對欄，前端不直接使用 |
| E: New  MOP | 價格 |

### 駐點清單

| 欄位 | 用途 |
|------|------|
| A: T2 | 通路 |
| B: 店名 | 門市名稱 |
| C: T2+店名 | 前端登入下拉選單 |
| G: 比對欄通路 | 比對欄 |
| H: 比對欄店名 | 比對欄 |

### 回報

| 欄位 | 用途 |
|------|------|
| A: ID | 回報唯一 ID |
| B: 時間 | 台北時間 ISO 字串 |
| C: 姓名 | 回報人 |
| D: 店名 | 門市 |
| E: PN | 產品 PN |
| F: 品名 | 產品名稱 |
| G: 價格 | 成交價格 |
| H: 備註 | 備註 |

## Vercel 環境變數

Production URL：

```text
https://staff-reporting-system-kappa.vercel.app
```

必要：

```text
GOOGLE_SHEET_ID=13dERZnpJIrB_H6DfpjVBYNuvYRUfjn-01YzCrALGBuw
GOOGLE_SERVICE_ACCOUNT_EMAIL=你的 service account email
GOOGLE_PRIVATE_KEY=你的 service account private key
```

`GOOGLE_PRIVATE_KEY` 放到 Vercel 時可保留 `\n`，程式會自動轉回換行。

也可以改用單一 JSON：

```text
GOOGLE_SHEET_ID=13dERZnpJIrB_H6DfpjVBYNuvYRUfjn-01YzCrALGBuw
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

臨時部署也支援使用既有 Google OAuth token：

```text
GOOGLE_SHEET_ID=13dERZnpJIrB_H6DfpjVBYNuvYRUfjn-01YzCrALGBuw
GOOGLE_OAUTH_CLIENT_ID=OAuth client id
GOOGLE_OAUTH_CLIENT_SECRET=OAuth client secret
GOOGLE_OAUTH_REFRESH_TOKEN=OAuth refresh token
```

長期仍建議改用 service account，權限比較單純，也比較不受個人帳號 token 影響。

如果工作表名稱未來改掉，可用這些變數覆蓋預設值：

```text
GOOGLE_PRODUCTS_SHEET=Price
GOOGLE_STORES_SHEET=駐點清單
GOOGLE_REPORTS_SHEET=回報
```

## Google 權限設定

1. 在 Google Cloud 建立 service account。
2. 產生 JSON key。
3. 把目標 Google Sheet 分享給 service account email。
4. 權限給「編輯者」。
5. 在 Vercel 專案設定環境變數。

之後更換資料庫 Sheet 時，只需要：

1. 新 Sheet 保留 `Price`、`駐點清單`、`回報` 3 張表與欄位順序。
2. 把新 Sheet 分享給同一個 service account。
3. 更新 Vercel 的 `GOOGLE_SHEET_ID`。

## API Routes

| Route | Method | 說明 |
|-------|--------|------|
| `/api/products` | GET | 讀取 `Price` 產品資料 |
| `/api/stores` | GET | 讀取 `駐點清單` 門市資料 |
| `/api/reports` | GET | 讀取今日回報，支援 `name`、`store`、`scope=all` |
| `/api/reports` | POST | 新增回報到 `回報` |
| `/api/reports/delete` | DELETE | 依 `id` 刪除回報 |

## 本地檢查

```bash
npm install
npm run check
```

本地完整啟動需先安裝 Vercel CLI 並設定上述環境變數：

```bash
npx vercel dev
```

## 歷史版本

Apps Script 版本已移到 `archive/`，只保留作為歷史參考。
