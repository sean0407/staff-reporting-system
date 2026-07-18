# Staff Reporting System

A mobile-first field sales reporting system for promoters, store staff, and field teams.

The app lets staff log in with their name and store, search products by PN or name, submit daily sales records, and review today's submitted reports. Admin users can view all reports for the day and export records to CSV.

## What It Does

- Mobile sales submission form for field staff
- Product lookup from Google Sheets
- Store list lookup from Google Sheets
- Daily personal sales summary
- Optional store average target display
- Admin view for all same-day reports
- CSV export for daily operations follow-up
- Vercel API Routes backend with Google Sheets as the database

## Architecture

```text
index.html
  -> /api/products
  -> /api/stores
  -> /api/reports
  -> /api/reports/delete
  -> Google Sheets API
  -> Google Sheet
```

## Repository Structure

```text
.
├── api/
│   ├── products.js
│   ├── stores.js
│   ├── reports.js
│   └── reports/delete.js
├── lib/
│   └── sheets.js
├── index.html
├── pricing.html
├── vercel.json
├── package.json
└── .env.example
```

## Google Sheet Schema

Create one Google Sheet with these worksheets. Worksheet names can be changed through environment variables.

### Products Sheet

Default worksheet name: `Price`

| Column | Field | Purpose |
|---|---|---|
| A | P/N | Product number |
| B | NAME | Product name |
| C | Category | Product category or spec |
| D | Match key | Optional internal matching field |
| E | Price | Selling price |
| F | Reward | Optional incentive amount |

### Stores Sheet

Default worksheet name: `駐點清單`

| Column | Field | Purpose |
|---|---|---|
| A | Channel | Channel or group |
| B | Store | Store name |
| C | Channel + Store | Login dropdown display value |

### Reports Sheet

Default worksheet name: `回報`

| Column | Field | Purpose |
|---|---|---|
| A | ID | Unique report ID |
| B | Time | Submission timestamp |
| C | Name | Staff name |
| D | Store | Store name |
| E | PN | Product number |
| F | Product name | Product name |
| G | Price | Submitted selling price |
| H | Note | Optional note |
| I | Reward | Reward captured at submission time |

### Store Average Sheet

Defaults to spreadsheet `1jUw-elSYrlIftyuGBcTbUqE5NmUmCMxQRViCdfcQ4uo`. Set `GOOGLE_STORE_AVERAGE_SHEET_ID` only when overriding the source.

Default worksheet name: `店平均`

| Column | Field | Purpose |
|---|---|---|
| A | Store | Store display value |
| B | Average | Daily average or target amount |

## Environment Variables

Copy `.env.example` and fill in your own values in Vercel.

Required:

```text
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

You can also use one JSON value instead of separate service account fields:

```text
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
```

Optional worksheet overrides:

```text
GOOGLE_PRODUCTS_SHEET=Price
GOOGLE_STORES_SHEET=駐點清單
GOOGLE_REPORTS_SHEET=回報
GOOGLE_STORE_AVERAGE_SHEET_ID=1jUw-elSYrlIftyuGBcTbUqE5NmUmCMxQRViCdfcQ4uo
GOOGLE_STORE_AVERAGE_SHEET=店平均
```

## Google Access Setup

1. Create a Google Cloud service account.
2. Generate a JSON key for that service account.
3. Share the target Google Sheet with the service account email.
4. Give the service account editor access.
5. Add the environment variables to Vercel.

## Local Check

```bash
npm install
npm run check
```

Local API testing is easiest through Vercel:

```bash
npm run dev
```

## Deploy To Vercel

1. Import this repository into Vercel.
2. Add the Google environment variables.
3. Deploy.
4. Open `/api/products` and `/api/stores` to confirm the backend can read the Google Sheet.
5. Open the app and submit one test report.

## Notes For Public Use

- Do not commit real service account keys, OAuth tokens, or private Google Sheet IDs.
- Use environment variables for every deployment-specific setting.
- Keep historical internal scripts outside the public repository.
- Rotate exposed Google Sheet IDs if the repository was previously public with real operational references.
