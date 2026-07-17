const {
  REPORTS_SHEET,
  appendValues,
  getStoreAverage,
  getQuery,
  handleError,
  json,
  makeId,
  parseBody,
  readRange,
  summarizeReports,
  taipeiIsoString,
} = require('../lib/sheets');

module.exports = async function reportsHandler(req, res) {
  try {
    if (req.method === 'GET') {
      const scope = getQuery(req, 'scope') || '';
      const name = getQuery(req, 'name') || '';
      const store = getQuery(req, 'store') || '';
      const rows = await readRange(`'${REPORTS_SHEET}'!A2:I`);
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
      const id = body.id || makeId();
      const timestamp = body.timestamp || taipeiIsoString();
      const row = [
        id,
        timestamp,
        body.name || '',
        body.store || '',
        body.pn || '',
        body.productName || '',
        body.price || '',
        body.note || '-',
        body.reward || '',
      ];

      await appendValues(`'${REPORTS_SHEET}'!A:I`, [row]);
      return json(res, 200, { status: 'success', id });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
};
