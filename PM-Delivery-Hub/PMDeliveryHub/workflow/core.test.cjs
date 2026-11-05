const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, payload, batch, checkBatch, recordPayload, recordBody, version } = require('./core.js');
const id = '11111111-1111-1111-1111-111111111111';
const example = () => ({ version: 1, projectId: id, meeting: { sourceKey: 'meeting-1', title: 'Synthetic review' },
  proposals: [{ key: 'a1', type: 'Action', payload: { title: 'Prepare test', description: 'Prepare synthetic test' },
    evidence: { sourceName: 'transcript.txt', locator: '00:01', excerpt: 'Prepare the test.' } }] });
test('normalizes optional values while preserving valid evidence', () => {
  const result = validate(example(), id);
  assert.equal(result.proposals[0].payload.dueDate, null);
  assert.equal(result.proposals[0].evidence.locator, '00:01');
});
test('rejects cross-project imports', () => assert.throws(() => validate(example(), '22222222-2222-2222-2222-222222222222'), /match/));
test('rejects unknown executable or unexpected fields', () => {
  const x = example(); x.proposals[0].payload.script = 'anything';
  assert.throws(() => validate(x, id), /Unknown/);
});
test('rejects duplicate keys, missing evidence and unsupported types', () => {
  const x = example(); x.proposals.push(x.proposals[0]);
  assert.throws(() => validate(x, id), /unique/);
  const y = example(); y.proposals[0].evidence.excerpt = '';
  assert.throws(() => validate(y, id), /excerpt/);
  const z = example(); z.proposals[0].type = 'Scope';
  assert.throws(() => validate(z, id), /Unsupported/);
});
test('validates actual dates and field lengths', () => {
  assert.throws(() => payload({ title: 't', description: 'd', dueDate: '2026-02-30' }), /real/);
  assert.equal(payload({ title: 't', description: 'd', dueDate: '2028-02-29' }).dueDate, '2028-02-29');
  const x = example(); x.meeting.title = 'x'.repeat(201);
  assert.throws(() => validate(x, id), /200/);
});
test('limits imports and enforces UTC timestamps', () => {
  const x = example(); x.proposals = [];
  assert.throws(() => validate(x, id), /1 and 50/);
  const y = example(); y.meeting.date = '2026-11-05';
  assert.throws(() => validate(y, id), /UTC/);
});
test('rejects rolled-over meeting dates and accepts real leap dates', () => {
  for (const date of ['2026-02-30T15:00:00Z', '2026-11-05T24:00:00Z', '2026-02-29T15:00:00Z']) {
    const x = example(); x.meeting.date = date;
    assert.throws(() => validate(x, id), /real UTC/);
  }
  const x = example(); x.meeting.date = '2028-02-29T15:00:00.1Z';
  assert.equal(validate(x, id).meeting.date, x.meeting.date);
});
test('accepts the proposal limit and rejects one above it', () => {
  const x = example();
  x.proposals = Array.from({ length: 50 }, (_, i) => ({ ...example().proposals[0], key: `candidate-${i}` }));
  assert.equal(validate(x, id).proposals.length, 50);
  x.proposals.push({ ...example().proposals[0], key: 'candidate-50' });
  assert.throws(() => validate(x, id), /1 and 50/);
});
test('accepts exact text limits and rejects overlong content and evidence', () => {
  assert.equal(payload({ title: 't'.repeat(200), description: 'd'.repeat(10000) }).description.length, 10000);
  assert.throws(() => payload({ title: 't', description: 'd'.repeat(10001) }), /10000/);
  const x = example(); x.proposals[0].evidence.excerpt = 'e'.repeat(10001);
  assert.throws(() => validate(x, id), /10000/);
});
test('validates source filename capacity and colon-free meeting keys', () => {
  const x = example();
  x.proposals[0].evidence.sourceName = 'f'.repeat(400);
  assert.equal(validate(x, id).proposals[0].evidence.sourceName.length, 400);
  x.proposals[0].evidence.sourceName += 'f';
  assert.throws(() => validate(x, id), /sourceName.*400/);
  const y = example(); y.meeting.sourceKey = 'meeting-2026-11-03T14:00:00Z';
  assert.throws(() => validate(y, id), /sourceKey/);
  y.meeting.sourceKey = 'meeting-2026-11-03T140000Z';
  assert.equal(validate(y, id).meeting.sourceKey, y.meeting.sourceKey);
});
test('transaction includes optimistic concurrency and catches nested failures', () => {
  const b = batch([{ method: 'PATCH', path: `pmdh_proposals(${id})`, etag: 'W/"12"', body: { status: 1 } }]);
  assert.match(b.body, /If-Match: W\/"12"/);
  assert.match(b.contentType, /multipart\/mixed/);
  assert.throws(() => checkBatch('HTTP/1.1 412 Precondition Failed'), /failed/);
  assert.throws(() => checkBatch('HTTP/1.1 302 Found'), /failed/);
  assert.throws(() => checkBatch('unexpected'), /failed/);
  checkBatch('HTTP/1.1 204 No Content');
});
test('legacy proposals normalize to Open without altering other content', () => {
  assert.equal(payload({ title: 'Legacy', description: 'Evidence-backed content' }).status, 'Open');
  assert.equal(payload({ title: 't', description: 'd', status: 'Resolved' }).status, 'Resolved');
  assert.throws(() => payload({ title: 't', description: 'd', status: 's'.repeat(101) }), /status.*100/);
});
test('record edits map only supported business fields and preserve dates', () => {
  const p = recordPayload({ pmdh_name: 'Risk', pmdh_description: 'Description', pmdh_status: 'Monitoring',
    pmdh_duedate: '2026-11-10T00:00:00Z', _pmdh_project_value: id, pmdh_lastreviewid: id });
  const body = recordBody(p);
  assert.equal(body.pmdh_status, 'Monitoring');
  assert.equal(body.pmdh_duedate, '2026-11-10');
  assert.equal(Object.keys(body).length, 9);
  assert.equal(body['pmdh_ResponsiblePerson@odata.bind'], null);
  assert.equal(body.pmdh_project, undefined);
  assert.equal(body.pmdh_lastreviewid, undefined);
  assert.equal(recordPayload({ pmdh_name: 't', pmdh_description: 'd' }).dueDate, null);
});
test('structured assignments use stable IDs and statuses reject ambiguous values', () => {
  const body = recordBody({ title: 't', description: 'd', responsiblePersonId: id });
  assert.equal(body['pmdh_ResponsiblePerson@odata.bind'], `/pmdh_people(${id})`);
  assert.throws(() => payload({ title: 't', description: 'd', responsiblePersonId: 'Developer 1' }), /directory ID/);
  assert.throws(() => payload({ title: 't', description: 'd', status: 'Done' }), /supported status/);
});
test('update snapshots require a valid concurrency version', () => {
  assert.equal(version('W/"123456"'), '123456');
  for (const etag of [undefined, '', '"123"', 'W/"bad"', 'W/"1"\r\nInjected: yes'])
    assert.throws(() => version(etag), /concurrency/);
});
