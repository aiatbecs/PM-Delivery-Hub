(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { projects: [], people: [], members: [], rows: [], users: [], manager: false, user: '', busy: false, valid: false, edit: null };
  const base = '/api/data/v9.2/';
  function node(tag, text) { const n = document.createElement(tag); n.textContent = text; return n; }
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').setAttribute('role', error ? 'alert' : 'status'); }
  async function api(path, method = 'GET', body, etag) {
    const r = await fetch(base + path, { method, headers: { Accept: 'application/json',
      Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(etag ? { 'If-Match': etag } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Dataverse ${r.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  async function all(path) {
    const rows = [];
    while (path) {
      const r = await api(path); rows.push(...r.value);
      const next = r['@odata.nextLink'];
      if (next && !next.startsWith(location.origin + base)) throw new Error('Unexpected paging origin.');
      path = next ? next.slice((location.origin + base).length) : '';
    }
    return rows;
  }
  async function run(task) {
    if (state.busy) return;
    state.busy = true; document.querySelectorAll('button,input,select').forEach(n => n.disabled = true); message('Working...');
    try { await task(); }
    catch (error) {
      console.error(error);
      state.valid = false;
      for (const id of ['cards', 'overview', 'summary', 'details']) $(id).replaceChildren();
      $('loaded').textContent = 'Reporting failed; refresh before using any totals.';
      message(error.message, true);
    }
    finally { state.busy = false; document.querySelectorAll('button,input,select').forEach(n => n.disabled = false); }
  }
  function options(id, rows, key, title, empty = 'All') {
    const select = $(id), previous = select.value;
    select.replaceChildren(new Option(empty, ''));
    for (const row of rows) select.add(new Option(row[title], row[key]));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
  }
  function projectName(id) { return state.projects.find(p => p.pmdh_projectid === id)?.pmdh_projectname || 'Unavailable project'; }
  function personName(id) {
    if (!id) return 'Unassigned';
    const person = state.people.find(p => p.pmdh_personid === id);
    if (!person) throw new Error('Assigned directory person is unavailable. Check permissions.');
    return `${person.pmdh_name} [${person.pmdh_directorykey}]`;
  }
  function table(container, headings, rows) {
    container.replaceChildren(); const t = node('table', ''), head = node('tr', '');
    for (const heading of headings) { const th = node('th', heading); th.scope = 'col'; head.append(th); }
    const thead = node('thead', ''); thead.append(head); t.append(thead);
    const body = node('tbody', '');
    for (const values of rows) { const tr = node('tr', ''); for (const value of values) { const td = node('td', ''); td.append(value instanceof Node ? value : node('span', String(value ?? ''))); tr.append(td); } body.append(tr); }
    t.append(body); container.append(t);
    if (!rows.length) container.append(node('p', 'No records match this view.'));
  }
  function action(text, callback) { const button = node('button', text); button.onclick = () => run(async () => { callback(); render(); message('View updated.'); }); return button; }
  function selected() {
    let rows = state.rows.filter(r => (!$('project').value || r._pmdh_project_value === $('project').value) &&
      (!$('person').value || ($('person').value === 'unassigned' ? !r._pmdh_responsibleperson_value : r._pmdh_responsibleperson_value === $('person').value)));
    if ($('view').value === 'my') {
      const identities = new Set(state.people.filter(p => p._pmdh_user_value === state.user).map(p => p.pmdh_personid));
      rows = rows.filter(r => identities.has(r._pmdh_responsibleperson_value));
    }
    return rows;
  }
  function render() {
    if (!state.valid) throw new Error('Refresh dashboards before using any totals.');
    const date = PMDHReports.day($('asOf').value), rows = selected(), totals = PMDHReports.summarize(rows, date);
    $('cards').replaceChildren();
    for (const [key, title, scope] of [['total', 'All RAID', 'all'], ['open', 'Open RAID', 'open'], ['overdue', 'Overdue', 'overdue'],
      ['dueSoon', 'Due within seven days', 'soon'], ['unassigned', 'Unassigned', 'unassigned']])
      $('cards').append(action(`${title}: ${totals[key]}`, () => { $('scope').value = scope; }));
    if ($('view').value === 'owners') {
      const groups = PMDHReports.group(rows, '_pmdh_responsibleperson_value', date);
      const lines = [];
      for (const group of groups) {
        const link = action(personName(group.id), () => { $('person').value = group.id || 'unassigned'; });
        lines.push([link, $('project').value ? 'Selected project total' : 'All accessible projects', group.counts.byKind.Action.open, group.counts.byKind.Action.total,
          group.counts.byKind.Risk.open, group.counts.byKind.Issue.open, group.counts.byKind.Dependency.open, group.counts.overdue]);
        for (const p of PMDHReports.group(group.records, '_pmdh_project_value', date))
          lines.push([personName(group.id), action(projectName(p.id), () => { $('person').value = group.id || 'unassigned'; $('project').value = p.id; }),
            p.counts.byKind.Action.open, p.counts.byKind.Action.total, p.counts.byKind.Risk.open, p.counts.byKind.Issue.open, p.counts.byKind.Dependency.open, p.counts.overdue]);
      }
      table($('overview'), ['Responsible person', 'Project', 'Open actions', 'Total actions', 'Open risks', 'Open issues', 'Open dependencies', 'Overdue RAID'], lines);
    } else {
      const visible = state.projects.filter(p => !$('project').value || p.pmdh_projectid === $('project').value);
      table($('overview'), ['Project', 'PM', 'Stage', 'Health', 'Open actions', 'Open risks', 'Open issues', 'Open dependencies', 'Overdue RAID'],
        visible.map(p => {
          const counts = PMDHReports.summarize(rows.filter(r => r._pmdh_project_value === p.pmdh_projectid), date);
          const formatted = field => p[field + '@OData.Community.Display.V1.FormattedValue'] || '(not set)';
          return [action(p.pmdh_projectname, () => { $('project').value = p.pmdh_projectid; }), formatted('_pmdh_projectmanager_value'),
            formatted('pmdh_stage'), formatted('pmdh_health'), ...PMDH.KINDS.slice(1).map(k => counts.byKind[k].open), counts.overdue];
        }));
    }
    $('summary').replaceChildren();
    const project = state.projects.find(p => p.pmdh_projectid === $('project').value);
    if (project) $('summary').append(node('h3', 'Current project summary'), node('pre', project.pmdh_currentsummary || '(No summary recorded)'));
    const week = new Date(Date.parse(date) + 7 * 86400000).toISOString().slice(0, 10);
    const details = rows.filter(r => {
      if ($('kind').value && r.kind !== $('kind').value) return false;
      const closed = ['Closed', 'Resolved', 'Cancelled'].includes(r.pmdh_status);
      const due = r.pmdh_duedate?.slice(0, 10), scope = $('scope').value;
      return scope === 'all' || scope === 'open' && !closed || scope === 'closed' && closed ||
        scope === 'overdue' && !closed && due && due < date || scope === 'soon' && !closed && due && due >= date && due <= week ||
        scope === 'unassigned' && !r._pmdh_responsibleperson_value;
    });
    $('detailTitle').textContent = `RAID details (${details.length})`;
    table($('details'), ['Project', 'Type', 'Title', 'Responsible person', 'Source responsible-party text', 'Status', 'Due date', 'Impact', 'Mitigation / response'],
      details.map(r => [projectName(r._pmdh_project_value), r.kind, r.pmdh_name, personName(r._pmdh_responsibleperson_value),
        r.pmdh_responsibleparty || '', r.pmdh_status || 'Open', r.pmdh_duedate?.slice(0, 10) || '', r.pmdh_impact || '', r.pmdh_response || '']));
  }
  async function refresh() {
    const [projects, people, members, rows] = await Promise.all([
      all('pmdh_projects?$orderby=pmdh_projectname'), all('pmdh_people?$orderby=pmdh_name'), all('pmdh_projectmembers'),
      Promise.all(PMDH.KINDS.slice(1).map(async kind => {
        const meta = await api(`EntityDefinitions(LogicalName='pmdh_${kind.toLowerCase()}')?$select=EntitySetName`);
        return (await all(meta.EntitySetName)).map(row => ({ ...row, kind, id: row[`pmdh_${kind.toLowerCase()}id`] }));
      })).then(groups => groups.flat())]);
    PMDHReports.summarize(rows, $('asOf').value);
    Object.assign(state, { projects, people, members, rows, valid: true });
    options('project', projects, 'pmdh_projectid', 'pmdh_projectname', 'All accessible projects');
    const directoryOptions = people.map(p => ({ ...p, label: personName(p.pmdh_personid) }));
    options('person', [...directoryOptions, { pmdh_personid: 'unassigned', label: 'Unassigned' }],
      'pmdh_personid', 'label', 'All responsible people');
    if (state.manager) {
      for (const id of ['memberProject']) options(id, projects, 'pmdh_projectid', 'pmdh_projectname', 'Select project');
      for (const id of ['memberPerson', 'editPerson']) options(id, directoryOptions, 'pmdh_personid', 'label', 'Select person');
      renderMembers();
    }
    render(); $('loaded').textContent = `Last refreshed: ${new Date().toLocaleString()}. Reporting is a read snapshot, not a historical reconstruction.`;
    message(`${projects.length} accessible projects; ${rows.length} official RAID records loaded.`);
  }
  function renderMembers() {
    table($('members'), ['Project', 'Person', 'Role', 'Access'], state.members.filter(m => !$('memberProject').value || m._pmdh_project_value === $('memberProject').value).map(m => {
      const remove = node('button', 'Remove membership');
      remove.onclick = () => run(async () => { await api(`pmdh_projectmembers(${m.pmdh_projectmemberid})`, 'DELETE', undefined, m['@odata.etag']); await refresh(); });
      return [projectName(m._pmdh_project_value), personName(m._pmdh_person_value), m.pmdh_role, remove];
    }));
  }
  function personBody() {
    if (!$('personName').value.trim() || !$('directoryKey').value.trim()) throw new Error('Person name and directory key are required.');
    if ($('email').value && !$('email').checkValidity()) throw new Error('Enter a valid work email.');
    return { pmdh_name: $('personName').value.trim(), pmdh_directorykey: $('directoryKey').value.trim(), pmdh_email: $('email').value.trim(),
      'pmdh_User@odata.bind': $('user').value ? `/systemusers(${$('user').value})` : null };
  }
  $('createPerson').onclick = () => run(async () => { await api('pmdh_people', 'POST', personBody()); await refresh(); });
  $('loadPerson').onclick = () => run(async () => {
    const person = state.people.find(p => p.pmdh_personid === $('editPerson').value);
    if (!person) throw new Error('Select an existing person.');
    state.edit = person; $('personName').value = person.pmdh_name; $('directoryKey').value = person.pmdh_directorykey;
    $('email').value = person.pmdh_email || '';
    if (person._pmdh_user_value && ![...$('user').options].some(o => o.value === person._pmdh_user_value))
      $('user').add(new Option('Existing inactive/unavailable account: ' + person._pmdh_user_value, person._pmdh_user_value));
    $('user').value = person._pmdh_user_value || ''; message('Person loaded; edit then Save existing person.');
  });
  $('savePerson').onclick = () => run(async () => {
    if (!state.edit || state.edit.pmdh_personid !== $('editPerson').value) throw new Error('Load the selected person before saving.');
    await api(`pmdh_people(${state.edit.pmdh_personid})`, 'PATCH', personBody(), state.edit['@odata.etag']); state.edit = null; await refresh();
  });
  $('addMember').onclick = () => run(async () => {
    if (!$('memberProject').value || !$('memberPerson').value || !$('memberRole').value.trim()) throw new Error('Select project, person and a project role.');
    await api('pmdh_projectmembers', 'POST', { pmdh_name: $('memberRole').value.trim(), pmdh_role: $('memberRole').value.trim(),
      'pmdh_Project@odata.bind': `/pmdh_projects(${$('memberProject').value})`, 'pmdh_Person@odata.bind': `/pmdh_people(${$('memberPerson').value})` });
    await refresh();
  });
  $('memberProject').onchange = () => run(async () => { renderMembers(); message('Membership list filtered.'); });
  $('refresh').onclick = () => run(refresh);
  for (const id of ['view', 'project', 'person', 'kind', 'scope', 'asOf']) $(id).onchange = () => run(async () => { render(); message('View updated.'); });
  const today = new Date(); $('asOf').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await run(async () => {
    state.user = (await api('WhoAmI')).UserId;
    const roles = await all(`systemusers(${state.user})/systemuserroles_association?$select=name`);
    state.manager = roles.some(r => r.name === 'PMDH Management'); $('management').hidden = !state.manager;
    if (state.manager) {
      state.users = await all('systemusers?$select=systemuserid,fullname,internalemailaddress&$filter=isdisabled eq false and applicationid eq null&$orderby=fullname');
      options('user', state.users.map(u => ({ ...u, label: `${u.fullname} (${u.internalemailaddress || u.systemuserid})` })), 'systemuserid', 'label', 'No app account');
    }
    const mode = new URLSearchParams(location.search).get('data');
    if (['projects', 'owners', 'my'].includes(mode)) $('view').value = mode;
    await refresh();
  });
})();
