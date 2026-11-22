const {
  REPORTS_SHEET,
  appendValues,
  getStoreAverage,
  getQuery,
  handleError,
  json,
  makeId,
  parseBody,
  readReportRowsForDates,
  readTodayReportRows,
  shiftTaipeiDate,
  summarizeReports,
  taipeiDateStringFromValue,
  taipeiIsoString,
  todayTaipeiDateString,
} = require('../lib/sheets');

// 回報 ID 只允許英數與連字號（UUID 或舊格式 時間戳-亂數）
const REPORT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const MAX_FIELD_LENGTH = 500;
// 姓名、門市、PN 上限；前端登入姓名欄位用同一個長度
const MAX_IDENTITY_LENGTH = 100;
// 重送時第一次查不到 ID，等這麼久再查一次（第一次寫入通常 1 秒左右完成）
const RETRY_RECHECK_DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function reportsHandler(req, res) {
  try {
    if (req.method === 'GET') {
      const scope = getQuery(req, 'scope') || '';
      const name = getQuery(req, 'name') || '';
      const store = getQuery(req, 'store') || '';
      const rows = (await readTodayReportRows()).map((entry) => entry.row);
      const payload = summarizeReports(rows, {
        includeUserFields: true,
        name: scope === 'all' ? '' : name,
        store: scope === 'all' ? '' : store,
      });

      if (scope !== 'all' && store) {
        payload.storeAverage = await getStoreAverage(store);
      }

      return json(res, 200, payload);
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      let invalidField = '';
      // 只接受字串或數字；物件、陣列、null 一律視為不合法；省略或空字串才用預設值
      const field = (key, fallback = '', maxLength = MAX_FIELD_LENGTH) => {
        const value = body[key];
        if (value === undefined || value === '') return fallback;
        if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
          invalidField = invalidField || key;
          return fallback;
        }
        const text = String(value).trim();
        // 識別欄位（姓名、門市、PN、ID）超長直接拒絕，不截斷，避免存進去的值和登入者對不上
        if (maxLength !== MAX_FIELD_LENGTH && text.length > maxLength) {
          invalidField = invalidField || key;
          return fallback;
        }
        return text.slice(0, MAX_FIELD_LENGTH);
      };

      const rawId = field('id', '', 64);
      const name = field('name', '', MAX_IDENTITY_LENGTH);
      const store = field('store', '', MAX_IDENTITY_LENGTH);
      const pn = field('pn', '', MAX_IDENTITY_LENGTH);
      const productName = field('productName');
      const price = field('price');
      const note = field('note', '-');
      const reward = field('reward');

      if (invalidField) {
        return json(res, 400, { error: `Invalid field: ${invalidField}` });
      }
      if (rawId && !REPORT_ID_PATTERN.test(rawId)) {
        return json(res, 400, { error: 'Invalid report id' });
      }
      if (!name || !store || !pn) {
        return json(res, 400, { error: 'Missing name, store, or pn' });
      }
      // retry、checkOnly 只能省略或是布林值
      for (const flag of ['retry', 'checkOnly']) {
        if (body[flag] !== undefined && typeof body[flag] !== 'boolean') {
          return json(res, 400, { error: `Invalid field: ${flag}` });
        }
      }
      const isRetry = body.retry === true || body.checkOnly === true;
      if (isRetry && !rawId) {
        return json(res, 400, { error: 'Retry requires report id' });
      }

      if (body.reportDate !== undefined
        && (typeof body.reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.reportDate))) {
        return json(res, 400, { error: 'Invalid field: reportDate' });
      }

      const today = todayTaipeiDateString();
      let checkDate = today;
      if (isRetry && body.reportDate !== undefined) {
        // reportDate 是手機算的台北日期，手機時鐘可能和伺服器差幾分鐘，跨午夜時會差一天；
        // 只接受伺服器的昨天、今天、明天，查重時另外一律加查伺服器的昨天與今天
        // 差超過一天（例如手機手動改過時間）時不回 400：原回報可能已寫入，改用伺服器今天查重
        const allowed = [shiftTaipeiDate(today, -1), today, shiftTaipeiDate(today, 1)];
        if (allowed.includes(body.reportDate)) checkDate = body.reportDate;
      }

      const id = rawId || makeId();

      // 前端重送時（上一次沒收到回應）先確認這個 ID 是否已寫入，已寫入就直接回成功。
      // 原回報可能在午夜後才寫入、手機時鐘也可能不準，所以查「原日期＋伺服器昨天＋伺服器今天」。
      // 第一次請求可能還在寫入中，查不到時等一下再查一次，降低兩筆都寫入的機會。
      if (isRetry) {
        // 回傳找到的那一列的台北入帳日期；找不到回 null
        const findWritten = async () => {
          const checked = new Set();
          // 查詢途中若跨過台北午夜，迴圈會再補查新的一天
          for (;;) {
            const now = todayTaipeiDateString();
            const pending = [checkDate, shiftTaipeiDate(now, -1), now].filter((d) => !checked.has(d));
            if (pending.length === 0) return null;
            pending.forEach((d) => checked.add(d));
            const rows = await readReportRowsForDates(pending);
            const match = rows.find(({ row }) => String(row[0] || '') === rawId);
            if (match) return taipeiDateStringFromValue(match.row[1]) || now;
          }
        };
        const duplicateResponse = (entryDate) => json(res, 200, {
          status: 'success', id, duplicate: true, entryDate,
        });

        let entryDate = await findWritten();
        if (entryDate) return duplicateResponse(entryDate);
        await sleep(RETRY_RECHECK_DELAY_MS);
        entryDate = await findWritten();
        if (entryDate) return duplicateResponse(entryDate);
        if (body.checkOnly === true) {
          return json(res, 404, { status: 'not_found', error: 'Report not found' });
        }
      }

      const timestamp = taipeiIsoString();
      // 重送只在「實際寫入時間」仍與原回報同一天時才寫；日期對不上時回 not_found，
      // 前端收到後會用新 ID 當成新的一筆送出（上一筆已確認沒寫入）
      if (isRetry && timestamp.slice(0, 10) !== checkDate) {
        return json(res, 404, { status: 'not_found', error: 'Report not found' });
      }
      const row = [
        id,
        timestamp,
        name,
        store,
        pn,
        productName,
        price,
        note,
        reward,
      ];

      await appendValues(`'${REPORTS_SHEET}'!A:I`, [row]);
      return json(res, 200, { status: 'success', id, entryDate: timestamp.slice(0, 10) });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
};
