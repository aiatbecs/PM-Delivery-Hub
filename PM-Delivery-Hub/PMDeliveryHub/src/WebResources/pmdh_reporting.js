(function (root) {
  'use strict';
  const kinds = ['Action', 'Risk', 'Issue', 'Dependency'];
  const terminal = ['Closed', 'Resolved', 'Cancelled'];
  const statuses = ['Open', 'In progress', 'Blocked', 'Monitoring', ...terminal];
  function day(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
      throw new Error('Reporting date must be a real YYYY-MM-DD date.');
    return value;
  }
  function summarize(rows, asOf) {
    day(asOf);
    const nextWeek = new Date(Date.parse(asOf) + 7 * 86400000).toISOString().slice(0, 10);
    const result = { total: rows.length, open: 0, closed: 0, overdue: 0, dueSoon: 0, unassigned: 0,
      byKind: Object.fromEntries(kinds.map(kind => [kind, { total: 0, open: 0, closed: 0, overdue: 0 }])) };
    const seen = new Set();
    for (const row of rows) {
      if (!kinds.includes(row.kind) || !row.id || seen.has(`${row.kind}:${row.id}`))
        throw new Error('Reporting requires unique official RAID records with a supported type.');
      seen.add(`${row.kind}:${row.id}`);
      const status = row.pmdh_status || 'Open';
      if (!statuses.includes(status)) throw new Error(`Unsupported status on ${row.id}: ${status}. Correct it before reporting.`);
      const due = row.pmdh_duedate ? day(row.pmdh_duedate.slice(0, 10)) : null;
      const closed = terminal.includes(status);
      result.byKind[row.kind].total++;
      result[closed ? 'closed' : 'open']++;
      result.byKind[row.kind][closed ? 'closed' : 'open']++;
      if (!row._pmdh_responsibleperson_value) result.unassigned++;
      if (!closed && due && due < asOf) { result.overdue++; result.byKind[row.kind].overdue++; }
      if (!closed && due && due >= asOf && due <= nextWeek) result.dueSoon++;
    }
    return result;
  }
  function group(rows, field, asOf) {
    const groups = new Map();
    for (const row of rows) {
      const id = row[field] || '';
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    }
    return [...groups].map(([id, records]) => ({ id, records, counts: summarize(records, asOf) }));
  }
  const api = { day, summarize, group };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PMDHReports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
