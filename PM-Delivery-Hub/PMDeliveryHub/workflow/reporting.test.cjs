const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, group } = require('./reporting.js');
const asOf = '2026-11-05';
const row = (id, project, owner, status = 'Open', due = null, kind = 'Action') =>
  ({ id, kind, _pmdh_project_value: project, _pmdh_responsibleperson_value: owner, pmdh_status: status, pmdh_duedate: due });
test('owner totals equal sums across projects, independent of source mentions', () => {
  const rows = [row('1', 'p1', 'dev1'), row('2', 'p1', 'dev1'), row('3', 'p2', 'dev1'),
    row('4', 'p2', 'dev2'), row('5', 'p2', null)];
  const owner = group(rows, '_pmdh_responsibleperson_value', asOf).find(g => g.id === 'dev1');
  assert.equal(owner.counts.byKind.Action.open, 3);
  assert.deepEqual(group(owner.records, '_pmdh_project_value', asOf).map(g => g.counts.byKind.Action.open), [2, 1]);
  assert.equal(summarize(rows, asOf).unassigned, 1);
});
test('date boundaries count today and day seven as upcoming, not overdue', () => {
  const rows = [row('1', 'p', 'o', 'Open', '2026-11-04'), row('2', 'p', 'o', 'Open', asOf),
    row('3', 'p', 'o', 'Blocked', '2026-11-12'), row('4', 'p', 'o', 'Open', '2026-11-13'),
    row('5', 'p', 'o', 'Closed', '2026-11-01')];
  const counts = summarize(rows, asOf);
  assert.equal(counts.overdue, 1);
  assert.equal(counts.dueSoon, 2);
  assert.equal(counts.closed, 1);
});
test('terminal statuses excluded from open totals; all four kinds remain separate', () => {
  const counts = summarize([row('1', 'p', 'o', 'Resolved', null, 'Risk'),
    row('2', 'p', 'o', 'Cancelled', null, 'Issue'), row('3', 'p', 'o', 'Monitoring', null, 'Dependency')], asOf);
  assert.equal(counts.byKind.Risk.closed, 1);
  assert.equal(counts.byKind.Issue.open, 0);
  assert.equal(counts.byKind.Dependency.open, 1);
  assert.equal(summarize([], asOf).total, 0);
});
test('duplicate IDs, unsupported statuses, and invalid dates fail explicitly', () => {
  const r = row('1', 'p', 'o');
  assert.throws(() => summarize([r, r], asOf), /unique/);
  assert.throws(() => summarize([row('2', 'p', 'o', 'Done')], asOf), /Unsupported status/);
  assert.throws(() => summarize([r], '2026-02-30'), /real/);
  assert.throws(() => summarize([row('2', 'p', 'o', 'Open', '2026-02-30')], asOf), /real/);
});
