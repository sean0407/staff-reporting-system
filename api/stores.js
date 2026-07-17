const {
  STORES_SHEET,
  handleError,
  json,
  readRange,
} = require('../lib/sheets');

module.exports = async function storesHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const rows = await readRange(`'${STORES_SHEET}'!A2:C`);
    const seen = new Set();
    const stores = [];

    rows.forEach((row) => {
      const combined = String(row[2] || '').trim();
      const fallback = `${String(row[0] || '').trim()}${String(row[1] || '').trim()}`.trim();
      const store = combined || fallback;

      if (!store || seen.has(store)) return;
      seen.add(store);
      stores.push(store);
    });

    return json(res, 200, stores);
  } catch (error) {
    return handleError(res, error);
  }
};
