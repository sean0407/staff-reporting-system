const {
  PRODUCTS_SHEET,
  handleError,
  json,
  readRange,
} = require('../lib/sheets');

module.exports = async function productsHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const rows = await readRange(`'${PRODUCTS_SHEET}'!A2:F`);
    const products = rows
      .filter((row) => row[0])
      .map((row) => {
        const category = String(row[2] || '').trim();

        return {
          pn: String(row[0] || '').trim(),
          name: String(row[1] || '').trim(),
          spec: category,
          category,
          price: String(row[4] || '').trim(),
          reward: String(row[5] || '').trim(),
        };
      });

    return json(res, 200, products);
  } catch (error) {
    return handleError(res, error);
  }
};
