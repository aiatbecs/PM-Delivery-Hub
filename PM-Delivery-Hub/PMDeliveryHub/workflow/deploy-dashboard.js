globalThis.PMDHDeployDashboard = async function (data) {
  const solution = 'PMDeliveryHub', base = '/api/data/v9.2/';
  async function api(path, method = 'GET', body) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      'MSCRM.SolutionUniqueName': solution, Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${text}`);
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
  async function component(id, type) {
    await api('AddSolutionComponent', 'POST', { ComponentId: id, ComponentType: type,
      SolutionUniqueName: solution, AddRequiredComponents: false });
  }
  const entities = await all("EntityDefinitions?$select=LogicalName,MetadataId&$filter=LogicalName eq 'pmdh_person' or LogicalName eq 'pmdh_projectmember'");
  for (const table of data.tables.filter(t => ['pmdh_person', 'pmdh_projectmember'].includes(t.SchemaName.toLowerCase()))) {
    if (!entities.some(e => e.LogicalName === table.SchemaName.toLowerCase())) {
      const created = await api('EntityDefinitions', 'POST', table);
      await component(created.MetadataId, 1);
    }
  }
  const relationships = await all("RelationshipDefinitions?$select=SchemaName&$filter=" +
    data.relationships.map(r => `SchemaName eq '${r.SchemaName}'`).join(' or '));
  for (const rel of data.relationships) {
    if (!relationships.some(r => r.SchemaName === rel.SchemaName))
      await api('RelationshipDefinitions', 'POST', rel);
  }
  for (const key of data.keys) {
    const schemaName = 'pmdh_' + key.name;
    const existing = (await api(`EntityDefinitions(LogicalName='${key.table}')/Keys?$select=SchemaName`)).value;
    if (!existing.some(k => k.SchemaName === schemaName))
      await api(`EntityDefinitions(LogicalName='${key.table}')/Keys`, 'POST', {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityKeyMetadata', SchemaName: schemaName,
        KeyAttributes: key.fields, DisplayName: { LocalizedLabels: [{ Label: key.name, LanguageCode: 1033 }] }
      });
  }
  const who = await api('WhoAmI');
  const bu = (await api("businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null")).value;
  if (bu.length !== 1) throw new Error('Expected one root business unit.');
  const names = [...data.tables.map(t => t.SchemaName.toLowerCase()), 'pmdh_project'];
  await api('PublishXml', 'POST', { ParameterXml: '<importexportxml><entities>' +
    names.map(n => '<entity>' + n + '</entity>').join('') + '</entities></importexportxml>' });
  const metadata = await Promise.all(names.map(n => api(`EntityDefinitions(LogicalName='${n}')?$select=LogicalName,Privileges`)));
  const roles = {};
  for (const name of ['PMDH Project Member', 'PMDH Management']) {
    const existing = (await api(`roles?$select=roleid&$filter=name eq '${name}' and _businessunitid_value eq ${bu[0].businessunitid}`)).value;
    if (existing.length > 1) throw new Error('Duplicate delivery role.');
    const role = existing[0] || await api('roles', 'POST', { name, 'businessunitid@odata.bind': `/businessunits(${bu[0].businessunitid})` });
    roles[name] = role.roleid;
    await component(role.roleid, 20);
    const privileges = [];
    for (const table of metadata) for (const privilege of table.Privileges) {
      const type = privilege.PrivilegeType, person = table.LogicalName === 'pmdh_person', member = table.LogicalName === 'pmdh_projectmember';
      const manager = name === 'PMDH Management';
      const allowed = manager
        ? ['Read', 'Create', 'Write', 'Append', 'AppendTo', 'Assign'].includes(type) || (person || member) && type === 'Delete'
        : person ? ['Read', 'AppendTo'].includes(type) : member ? type === 'Read'
        : ['Read', 'Write', 'Append', 'AppendTo', 'Assign'].includes(type) || table.LogicalName !== 'pmdh_project' && type === 'Create';
      if (allowed) privileges.push({ PrivilegeId: privilege.PrivilegeId, Depth: manager || person ? 'Global' : 'Basic' });
    }
    const standard = await all("privileges?$select=privilegeid,name&$filter=name eq 'prvReadRole' or name eq 'prvReadWebResource' or name eq 'prvReadAppModule'" +
      (name === 'PMDH Management' ? " or name eq 'prvReadTeam'" : ""));
    for (const p of standard) privileges.push({ PrivilegeId: p.privilegeid, Depth: 'Global' });
    const users = await api("EntityDefinitions(LogicalName='systemuser')?$select=Privileges");
    for (const p of users.Privileges.filter(p => ['Read', 'AppendTo'].includes(p.PrivilegeType)))
      privileges.push({ PrivilegeId: p.PrivilegeId, Depth: name === 'PMDH Management' || p.PrivilegeType === 'AppendTo' ? 'Global' : 'Local' });
    await api(`roles(${role.roleid})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, 'POST', { Privileges: privileges });
  }
  const assigned = (await api(`systemusers(${who.UserId})/systemuserroles_association?$select=roleid`)).value;
  if (!assigned.some(r => r.roleid === roles['PMDH Management']))
    await api(`systemusers(${who.UserId})/systemuserroles_association/$ref`, 'POST', {
      '@odata.id': location.origin + base + `roles(${roles['PMDH Management']})`
    });
  const assemblies = (await api("pluginassemblies?$select=pluginassemblyid&$filter=name eq 'PMDeliveryHub.ApprovalGuard'")).value;
  if (assemblies.length !== 1) throw new Error('Expected deployed signed assembly.');
  const assembly = assemblies[0].pluginassemblyid;
  await api(`pluginassemblies(${assembly})`, 'PATCH', { content: data.assembly });
  const projects = await all('pmdh_projects?$select=pmdh_projectid,_pmdh_deliveryteam_value');
  const allNames = names.filter(n => !['pmdh_project', 'pmdh_person'].includes(n));
  const migrated = [];
  for (const project of projects) {
    let team = project._pmdh_deliveryteam_value;
    if (!team) {
      const created = await api('teams', 'POST', { name: 'PMDH ' + project.pmdh_projectid, teamtype: 0,
        'businessunitid@odata.bind': `/businessunits(${bu[0].businessunitid})` });
      team = created.teamid;
      await api(`teams(${team})/teamroles_association/$ref`, 'POST', {
        '@odata.id': location.origin + base + `roles(${roles['PMDH Project Member']})`
      });
      await api(`pmdh_projects(${project.pmdh_projectid})`, 'PATCH', {
        'pmdh_DeliveryTeam@odata.bind': `/teams(${team})`, 'ownerid@odata.bind': `/teams(${team})`
      });
    }
    for (const logical of allNames) {
      const set = (await api(`EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName`)).EntitySetName;
      const rows = await all(`${set}?$select=${logical}id,_ownerid_value&$filter=_pmdh_project_value eq ${project.pmdh_projectid}`);
      for (const row of rows) if (row._ownerid_value !== team)
        await api(`${set}(${row[logical + 'id']})`, 'PATCH', { 'ownerid@odata.bind': `/teams(${team})` });
    }
    migrated.push(project.pmdh_projectid);
  }
  const types = (await api(`plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assembly}`)).value;
  let type = types.find(t => t.typename === 'PMDeliveryHub.DeliveryGuard');
  if (!type) type = await api('plugintypes', 'POST', { typename: 'PMDeliveryHub.DeliveryGuard', name: 'PMDeliveryHub.DeliveryGuard',
    friendlyname: 'PM Delivery Hub people and ownership guard', 'pluginassemblyid@odata.bind': `/pluginassemblies(${assembly})` });
  const messages = await all("sdkmessages?$select=sdkmessageid,name&$filter=name eq 'Create' or name eq 'Update' or name eq 'Delete' or name eq 'Assign'");
  const filters = await all("sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value&$filter=" +
    messages.map(m => `_sdkmessageid_value eq ${m.sdkmessageid}`).join(' or '));
  const existingSteps = await all("sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name&$filter=startswith(name,'PMDH')");
  const imageAttributes = 'pmdh_name,pmdh_description,pmdh_responsibleparty,pmdh_responsibleperson,pmdh_duedate,pmdh_impact,pmdh_response,pmdh_probability,pmdh_status';
  const images = await all("sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,_sdkmessageprocessingstepid_value,name");
  for (const step of existingSteps.filter(s => s.name.startsWith('PMDH History Update'))) {
    const image = images.find(i => i._sdkmessageprocessingstepid_value === step.sdkmessageprocessingstepid && i.name === 'Before');
    if (!image) throw new Error('History pre-image missing.');
    await api(`sdkmessageprocessingstepimages(${image.sdkmessageprocessingstepimageid})`, 'PATCH', {
      name: 'Before', entityalias: 'Before', imagetype: 0, messagepropertyname: 'Target', attributes: imageAttributes,
      'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`
    });
  }
  async function step(logical, message, stage) {
    const name = `PMDH Delivery ${message} ${logical} ${stage}`;
    if (existingSteps.some(s => s.name === name)) return;
    const msg = messages.find(m => m.name === message);
    const filter = filters.find(f => f.primaryobjecttypecode === logical && f._sdkmessageid_value === msg.sdkmessageid);
    if (!filter) throw new Error(`Message filter missing: ${logical} ${message}`);
    const row = await api('sdkmessageprocessingsteps', 'POST', { name, stage, mode: 0, rank: 1,
      supporteddeployment: 0, 'eventhandler_plugintype@odata.bind': `/plugintypes(${type.plugintypeid})`,
      'sdkmessageid@odata.bind': `/sdkmessages(${msg.sdkmessageid})`,
      'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filter.sdkmessagefilterid})` });
    await component(row.sdkmessageprocessingstepid, 92);
    if (stage === 40 && (message === 'Delete' || logical === 'pmdh_person' && message === 'Update'))
      await api('sdkmessageprocessingstepimages', 'POST', { name: 'Before', entityalias: 'Before', imagetype: 0,
        messagepropertyname: 'Target', attributes: logical === 'pmdh_person' ? 'pmdh_user' : 'pmdh_project,pmdh_person',
        'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${row.sdkmessageprocessingstepid})` });
  }
  for (const logical of names) {
    for (const message of ['Create', 'Update', 'Delete', 'Assign']) await step(logical, message, 20);
    if (logical === 'pmdh_project') await step(logical, 'Create', 40);
    if (logical === 'pmdh_person') for (const message of ['Create', 'Update']) await step(logical, message, 40);
    if (logical === 'pmdh_projectmember') for (const message of ['Create', 'Update', 'Delete']) await step(logical, message, 40);
  }
  const resourceIds = [];
  for (const r of data.resources) {
    const existing = (await api(`webresourceset?$select=webresourceid&$filter=name eq '${r.name}'`)).value;
    const resource = existing[0] || await api('webresourceset', 'POST', { name: r.name, displayname: r.name,
      webresourcetype: r.type, content: r.content });
    if (existing.length) await api(`webresourceset(${resource.webresourceid})`, 'PATCH', { content: r.content });
    await component(resource.webresourceid, 61); resourceIds.push(resource.webresourceid);
  }
  const apps = (await api("appmodules?$select=appmoduleid&$filter=uniquename eq 'pmdh_PMDeliveryHub'")).value;
  if (apps.length !== 1) throw new Error('Expected one PM Delivery Hub app.');
  const app = apps[0].appmoduleid;
  const appRoles = (await api(`appmodules(${app})/appmoduleroles_association?$select=roleid`)).value;
  for (const role of Object.values(roles)) if (!appRoles.some(r => r.roleid === role))
    await api(`appmodules(${app})/appmoduleroles_association/$ref`, 'POST', {
      '@odata.id': location.origin + base + `roles(${role})`
    });
  await api('PublishXml', 'POST', { ParameterXml: '<importexportxml><entities>' +
    names.map(n => '<entity>' + n + '</entity>').join('') + '</entities><webresources>' +
    resourceIds.map(id => '<webresource>{' + id + '}</webresource>').join('') +
    '</webresources><appmodules><appmodule>{' + app + '}</appmodule></appmodules></importexportxml>' });
  return { projectsMigrated: migrated.length, managementUser: who.UserId, roles, resourceIds, deliveryPluginType: type.plugintypeid };
};
