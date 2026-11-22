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

// 只接受 400-599 的數字狀態碼；Google 函式庫的 error.code 可能是 'ETIMEDOUT' 這類字串
function resolveStatusCode(error) {
  const candidates = [error && error.statusCode, error && error.code];
  for (const value of candidates) {
    let code = null;
    if (typeof value === 'number') code = value;
    else if (typeof value === 'string' && /^\d{3}$/.test(value)) code = Number(value);
    if (Number.isInteger(code) && code >= 400 && code <= 599) return code;
  }
  return 500;
}

function handleError(res, error) {
  const statusCode = resolveStatusCode(error);
  // 詳細錯誤只寫伺服器日誌；5xx 不把上游或設定訊息回給使用者
  console.error('[api error]', statusCode, error && (error.stack || error.message || error));
  const message = statusCode < 500 && error && error.expose
    ? error.message
    : (statusCode < 500 ? 'Request failed' : 'Server error, please try again later');
  json(res, statusCode, { error: message });
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
    valueInputOption: 'RAW',
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

function parseJsonText(text) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch (parseError) {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    err.expose = true;
    throw err;
  }
}

async function parseBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return parseJsonText(req.body.toString('utf8'));
  }

  if (req.body && typeof req.body === 'object') {
    if (Array.isArray(req.body)) return parseJsonText('[]');
    return req.body;
  }

  if (typeof req.body === 'string') {
    return parseJsonText(req.body);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return parseJsonText(Buffer.concat(chunks).toString('utf8'));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// 建立 Intl.DateTimeFormat 很耗時，整個模組共用一個（每列都新建會讓 2 萬列多花 0.5 秒以上）
const TAIPEI_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

function getTaipeiParts(date = new Date()) {
  return Object.fromEntries(
    TAIPEI_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function parseReportDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasTimezone ? raw : `${raw}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function taipeiIsoString(date = new Date()) {
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function todayTaipeiDateString() {
  const parts = getTaipeiParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function taipeiDateStringFromValue(value) {
  const date = parseReportDate(value);
  if (!date) return '';

  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatReportTime(value) {
  const date = parseReportDate(value);
  if (!date) return value || '';

  const parts = getTaipeiParts(date);
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

/**
 * 只讀今天（台北日期）的回報列，避免每次讀整張歷史。
 * 先讀時間欄（B）找出今天的列號範圍，再只讀該範圍的 A:I。
 * 回傳 [{ row, rowNumber }]，rowNumber 是工作表上的實際列號。
 */
/**
 * 讀出指定幾個台北日期（YYYY-MM-DD）的回報列：B 欄只讀一次，再只讀涵蓋這些日期的 A:I 範圍。
 * 回傳 [{ row, rowNumber }]，rowNumber 是工作表上的實際列號。
 */
async function readReportRowsForDates(dateStrings) {
  const wanted = new Set(dateStrings);
  const times = await readRange(`'${REPORTS_SHEET}'!B2:B`);

  let first = -1;
  let last = -1;
  times.forEach((cell, index) => {
    if (wanted.has(taipeiDateStringFromValue(cell && cell[0]))) {
      if (first === -1) first = index;
      last = index;
    }
  });

  if (first === -1) return [];

  const startRow = first + 2;
  const endRow = last + 2;
  const rows = await readRange(`'${REPORTS_SHEET}'!A${startRow}:I${endRow}`);

  return rows
    .map((row, index) => ({ row, rowNumber: startRow + index }))
    .filter(({ row }) => wanted.has(taipeiDateStringFromValue(row[1])));
}

async function readTodayReportRows() {
  return readReportRowsForDates([todayTaipeiDateString()]);
}

// 台北日期字串加減天數（YYYY-MM-DD）
function shiftTaipeiDate(dateString, days) {
  const base = new Date(`${dateString}T12:00:00+08:00`);
  return taipeiDateStringFromValue(new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString());
}

function toNumber(value) {
  const normalized = String(value || '').replace(/[^0-9.]/g, '');
  return normalized ? Number.parseFloat(normalized) || 0 : 0;
}

async function getStoreAverage(storeName) {
  if (!storeName) return null;
  if (!STORE_AVERAGE_SHEET_ID) return null;

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
  let rewardTotal = 0;
  let count = 0;
  const reports = [];

  rows.forEach((row) => {
    const time = String(row[1] || '');
    const name = String(row[2] || '');
    const store = String(row[3] || '');

    if (taipeiDateStringFromValue(time) !== today) return;
    if (nameFilter && name !== nameFilter) return;
    if (storeFilter && store !== storeFilter) return;

    const price = toNumber(row[6]);
    if (price) {
      total += price;
      count += 1;
    }

    const reward = toNumber(row[8]);
    if (reward) {
      rewardTotal += reward;
    }

    const report = {
      id: String(row[0] || ''),
      time: formatReportTime(time),
      timestamp: time,
      pn: String(row[4] || ''),
      productName: String(row[5] || ''),
      price: String(row[6] || ''),
      note: String(row[7] || ''),
      reward: String(row[8] || ''),
    };

    if (includeUserFields) {
      report.name = name;
      report.store = store;
    }

    reports.push(report);
  });

  return { total, rewardTotal, count, reports };
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
  readReportRowsForDates,
  readTodayReportRows,
  shiftTaipeiDate,
  summarizeReports,
  taipeiDateStringFromValue,
  taipeiIsoString,
  todayTaipeiDateString,
};
