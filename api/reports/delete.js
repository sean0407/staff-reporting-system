const {
  REPORTS_SHEET,
  deleteRow,
  getQuery,
  handleError,
  json,
  readTodayReportRows,
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

    // readTodayReportRows 只回傳今天的列，維持「只能刪今日回報」的限制
    const todayRows = await readTodayReportRows();
    const match = todayRows.find(({ row }) => (
      String(row[0] || '') === id &&
      String(row[2] || '') === name &&
      String(row[3] || '') === store
    ));

    if (!match) {
      return json(res, 404, { error: 'Report not found or permission denied' });
    }

    await deleteRow(REPORTS_SHEET, match.rowNumber);
    return json(res, 200, { status: 'success' });
  } catch (error) {
    return handleError(res, error);
  }
};
