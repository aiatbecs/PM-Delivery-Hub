(function (root) {
  'use strict';
  const KINDS = ['Summary', 'Action', 'Risk', 'Issue', 'Dependency'];
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function string(value, name, max, optional = false) {
    if (optional && (value === undefined || value === null)) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max)
      throw new Error(`${name} must be ${optional ? 'a' : 'a nonempty'} string of at most ${max} characters.`);
    return value.trim();
  }
  function object(value, name, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
    for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
  }
  function payload(value) {
    object(value, 'payload', ['title', 'description', 'responsibleParty', 'dueDate', 'impact', 'response', 'probability']);
    const result = { title: string(value.title, 'title', 200), description: string(value.description, 'description', 10000) };
    for (const name of ['responsibleParty', 'impact', 'response', 'probability'])
      result[name] = string(value[name], name, name === 'responsibleParty' ? 200 : name === 'probability' ? 100 : 4000, true);
    const due = string(value.dueDate, 'dueDate', 10, true);
    if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)) throw new Error('dueDate must be a real YYYY-MM-DD date, or null.');
    result.dueDate = due || null;
    return result;
  }
  function validate(input, projectId) {
    object(input, 'import', ['version', 'projectId', 'meeting', 'proposals']);
    if (input.version !== 1) throw new Error('Import version must be 1.');
    if (!GUID.test(input.projectId || '') || input.projectId.toLowerCase() !== projectId.toLowerCase())
      throw new Error('Import projectId must match the selected project.');
    object(input.meeting, 'meeting', ['sourceKey', 'title', 'date', 'attendees', 'transcript']);
    const m = input.meeting;
    const meeting = {
      sourceKey: string(m.sourceKey, 'sourceKey', 100),
      title: string(m.title, 'meeting.title', 200),
      attendees: string(m.attendees, 'attendees', 4000, true),
      transcript: string(m.transcript, 'transcript', 100000, true),
      date: string(m.date, 'meeting.date', 30, true)
    };
    if (!/^[a-zA-Z0-9_-]+$/.test(meeting.sourceKey)) throw new Error('sourceKey must contain only letters, digits, underscore or hyphen.');
    if (meeting.date && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(meeting.date) ||
      !Number.isFinite(Date.parse(meeting.date)) ||
      new Date(meeting.date).toISOString().slice(0, 19) !== meeting.date.slice(0, 19)))
      throw new Error('meeting.date must be a real UTC ISO timestamp ending in Z.');
    if (!Array.isArray(input.proposals) || !input.proposals.length || input.proposals.length > 50)
      throw new Error('Import must contain between 1 and 50 proposals.');
    const seen = new Set();
    const proposals = input.proposals.map(p => {
      object(p, 'proposal', ['key', 'type', 'payload', 'evidence']);
      const key = string(p.key, 'proposal.key', 100);
      if (!/^[a-zA-Z0-9_-]+$/.test(key) || seen.has(key)) throw new Error('Candidate keys must be unique and use letters, digits, underscore or hyphen.');
      seen.add(key);
      if (!KINDS.includes(p.type)) throw new Error(`Unsupported proposal type: ${p.type}`);
      object(p.evidence, 'evidence', ['sourceName', 'locator', 'excerpt']);
      return { key, type: p.type, payload: payload(p.payload), evidence: {
        sourceName: string(p.evidence.sourceName, 'sourceName', 200),
        locator: string(p.evidence.locator, 'locator', 200),
        excerpt: string(p.evidence.excerpt, 'excerpt', 10000)
      } };
    });
    return { version: 1, projectId: projectId.toLowerCase(), meeting, proposals };
  }
  function batch(operations) {
    const boundary = `batch_${crypto.randomUUID()}`, changeset = `changeset_${crypto.randomUUID()}`;
    const lines = [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, ''];
    operations.forEach((op, i) => {
      lines.push(`--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary',
        `Content-ID: ${i + 1}`, '', `${op.method} /api/data/v9.2/${op.path} HTTP/1.1`,
        'Content-Type: application/json;type=entry', 'Accept: application/json');
      if (op.etag) lines.push(`If-Match: ${op.etag}`);
      lines.push('', JSON.stringify(op.body), '');
    });
    lines.push(`--${changeset}--`, `--${boundary}--`, '');
    return { body: lines.join('\r\n'), contentType: `multipart/mixed;boundary=${boundary}` };
  }
  function checkBatch(text) {
    const statuses = [...text.matchAll(/HTTP\/1\.1 (\d{3})/g)].map(m => Number(m[1]));
    if (!statuses.length || statuses.some(s => s < 200 || s >= 300))
      throw new Error(`Dataverse transaction failed: ${text.slice(0, 4000)}`);
  }
  const api = { KINDS, validate, payload, batch, checkBatch };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PMDH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
