const {
  REPORTS_SHEET,
  deleteRow,
  getQuery,
  handleError,
  json,
  readRange,
} = require('../../lib/sheets');

module.exports = async function deleteReportHandler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const id = getQuery(req, 'id') || '';
    const name = getQuery(req, 'name') || '';
    const store = getQuery(req, 'store') || '';

    if (!id || !name || !store) {
      return json(res, 400, { error: 'Missing report id, name, or store' });
    }

    const rows = await readRange(`'${REPORTS_SHEET}'!A2:I`);
    const rowIndex = rows.findIndex((row) => {
      const rowId = String(row[0] || '');
      const rowName = String(row[2] || '');
      const rowStore = String(row[3] || '');
      return rowId === id && rowName === name && rowStore === store;
    });

    if (rowIndex === -1) {
      return json(res, 404, { error: 'Report not found or permission denied' });
    }

    await deleteRow(REPORTS_SHEET, rowIndex + 2);
    return json(res, 200, { status: 'success' });
  } catch (error) {
    return handleError(res, error);
  }
};
