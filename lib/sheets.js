const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const PRODUCTS_SHEET = process.env.GOOGLE_PRODUCTS_SHEET || 'Price';
const STORES_SHEET = process.env.GOOGLE_STORES_SHEET || '駐點清單';
const REPORTS_SHEET = process.env.GOOGLE_REPORTS_SHEET || '回報';
const STORE_AVERAGE_SHEET_ID = process.env.GOOGLE_STORE_AVERAGE_SHEET_ID || '1jUw-elSYrlIftyuGBcTbUqE5NmUmCMxQRViCdfcQ4uo';
const STORE_AVERAGE_SHEET = process.env.GOOGLE_STORE_AVERAGE_SHEET || '店平均';

let sheetsClient;

function getPrivateKey() {
  if (process.env.GOOGLE_PRIVATE_KEY) {
    return process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return serviceAccount.private_key;
  }

  return '';
}

function getServiceAccountEmail() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return serviceAccount.client_email;
  }

  return '';
}

function hasServiceAccountConfig() {
  return Boolean(getServiceAccountEmail() && getPrivateKey());
}

function hasOAuthConfig() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function requireConfig() {
  const missing = [];
  if (!SHEET_ID) missing.push('GOOGLE_SHEET_ID');

  if (!hasServiceAccountConfig() && !hasOAuthConfig()) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY or GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN');
  }

  if (missing.length > 0) {
    const err = new Error(`Missing environment variables: ${missing.join(', ')}`);
    err.statusCode = 500;
    throw err;
  }
}

function getSheetsClient() {
  requireConfig();

  if (!sheetsClient) {
    let auth;

    if (hasServiceAccountConfig()) {
      auth = new google.auth.JWT({
        email: getServiceAccountEmail(),
        key: getPrivateKey(),
        scopes: SCOPES,
      });
    } else {
      auth = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET
      );
      auth.setCredentials({
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      });
    }

    sheetsClient = google.sheets({ version: 'v4', auth });
  }

  return sheetsClient;
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

function handleError(res, error) {
  const statusCode = error.statusCode || error.code || 500;
  json(res, statusCode, {
    error: error.message || String(error),
  });
}

function getQuery(req, key) {
  const value = req.query && req.query[key];
  return Array.isArray(value) ? value[0] : value;
}

async function readRange(range, spreadsheetId = SHEET_ID) {
  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return result.data.values || [];
}

async function appendValues(range, values) {
  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  return result.data;
}

async function deleteRow(sheetName, rowNumber) {
  const sheets = getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties',
  });

  const sheet = (metadata.data.sheets || []).find(
    (entry) => entry.properties && entry.properties.title === sheetName
  );

  if (!sheet) {
    const err = new Error(`Sheet not found: ${sheetName}`);
    err.statusCode = 404;
    throw err;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function taipeiIsoString() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
}

function todayTaipeiDateString() {
  return taipeiIsoString().slice(0, 10);
}

function formatReportTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toNumber(value) {
  const normalized = String(value || '').replace(/[^0-9.]/g, '');
  return normalized ? Number.parseFloat(normalized) || 0 : 0;
}

async function getStoreAverage(storeName) {
  if (!storeName) return null;

  const rows = await readRange(`'${STORE_AVERAGE_SHEET}'!A3:B`, STORE_AVERAGE_SHEET_ID);
  const normalizedStore = String(storeName).trim();
  const match = rows.find((row) => String(row[0] || '').trim() === normalizedStore);

  if (!match) return null;

  const rawAverage = String(match[1] || '').trim();
  const amount = toNumber(rawAverage);

  return {
    store: normalizedStore,
    amount,
    raw: rawAverage,
  };
}

function summarizeReports(rows, options = {}) {
  const today = todayTaipeiDateString();
  const nameFilter = options.name || '';
  const storeFilter = options.store || '';
  const includeUserFields = Boolean(options.includeUserFields);

  let total = 0;
  let count = 0;
  const reports = [];

  rows.forEach((row) => {
    const time = String(row[1] || '');
    const name = String(row[2] || '');
    const store = String(row[3] || '');

    if (time.slice(0, 10) !== today) return;
    if (nameFilter && name !== nameFilter) return;
    if (storeFilter && store !== storeFilter) return;

    const price = toNumber(row[6]);
    if (price) {
      total += price;
      count += 1;
    }

    const report = {
      id: String(row[0] || ''),
      time: formatReportTime(time),
      timestamp: time,
      pn: String(row[4] || ''),
      productName: String(row[5] || ''),
      price: String(row[6] || ''),
      note: String(row[7] || ''),
    };

    if (includeUserFields) {
      report.name = name;
      report.store = store;
    }

    reports.push(report);
  });

  return { total, count, reports };
}

module.exports = {
  PRODUCTS_SHEET,
  STORES_SHEET,
  REPORTS_SHEET,
  appendValues,
  deleteRow,
  getStoreAverage,
  getQuery,
  handleError,
  json,
  makeId,
  parseBody,
  readRange,
  summarizeReports,
  taipeiIsoString,
};
