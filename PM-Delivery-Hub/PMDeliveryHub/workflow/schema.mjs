const label = text => ({ LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] });
const required = value => ({ Value: value ? 'ApplicationRequired' : 'None' });
export function text(name, title, max = 200, mandatory = false) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: `pmdh_${name}`,
    DisplayName: label(title), RequiredLevel: required(mandatory), MaxLength: max, FormatName: { Value: 'Text' } };
}
function memo(name, title, max = 50000) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: `pmdh_${name}`,
    DisplayName: label(title), RequiredLevel: required(false), MaxLength: max, Format: 'Text' };
}
function choice(name, title, options, defaultValue = 425070000) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', SchemaName: `pmdh_${name}`,
    DisplayName: label(title), RequiredLevel: required(true), DefaultFormValue: defaultValue,
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false,
      OptionSetType: 'Picklist', Options: options.map((v, i) => ({ Value: 425070000 + i, Label: label(v) })) } };
}
const date = (name, title, dateOnly = false) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', SchemaName: `pmdh_${name}`,
  DisplayName: label(title), RequiredLevel: required(false), Format: dateOnly ? 'DateOnly' : 'DateAndTime',
  DateTimeBehavior: { Value: dateOnly ? 'DateOnly' : 'UserLocal' }
});
const table = (name, title, plural, attributes) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata', SchemaName: `pmdh_${name}`,
  ...(name === 'Person' ? { EntitySetName: 'pmdh_people' } : {}),
  DisplayName: label(title), DisplayCollectionName: label(plural), Description: label(`PM Delivery Hub ${title}`),
  OwnershipType: 'UserOwned', IsActivity: false, HasActivities: false, HasNotes: false,
  IsAuditEnabled: { Value: true }, IsOptimisticConcurrencyEnabled: true,
  Attributes: [{ ...text('Name', 'Title', 200, true), IsPrimaryName: true }, ...attributes]
});
export const tables = [
  table('Person', 'Delivery Person', 'Delivery People', [
    text('DirectoryKey', 'Directory Key', 100, true), text('Email', 'Work Email', 200)
  ]),
  table('ProjectMember', 'Project Member', 'Project Members', [
    text('Role', 'Project Role', 100, true)
  ]),
  table('Meeting', 'Meeting', 'Meetings', [
    date('MeetingDate', 'Meeting Date'), memo('Transcript', 'Transcript', 100000),
    memo('Attendees', 'Attendees', 4000), memo('Summary', 'Approved Summary', 10000),
    text('SourceKey', 'Source Key', 100, true)
  ]),
  table('Evidence', 'Evidence', 'Evidence', [
    text('SourceName', 'Source Name', 400, true), text('Locator', 'Source Locator', 200, true),
    memo('Excerpt', 'Supporting Excerpt', 10000)
  ]),
  table('Proposal', 'AI Proposal', 'AI Proposals', [
    text('CandidateKey', 'Candidate Key', 100, true),
    choice('Kind', 'Proposal Type', ['Summary', 'Action', 'Risk', 'Issue', 'Dependency']),
    memo('Payload', 'Structured Proposal', 20000),
    choice('ReviewStatus', 'Review Status', ['Pending', 'Approved', 'Edited and Approved', 'Rejected']),
    date('ReviewedOn', 'Reviewed On'),
    text('AppliedId', 'Applied Record ID', 36),
    text('TargetRecordId', 'Update Target Record ID', 36),
    text('TargetVersion', 'Update Target Version', 30),
    memo('BeforePayload', 'Before Approval Snapshot', 50000),
    memo('SourceCandidates', 'Consolidated Source Candidates', 4000)
  ]),
  ...['Action', 'Risk', 'Issue', 'Dependency'].map(name => table(name, name, `${name === 'Dependency' ? 'Dependencies' : name + 's'}`, [
    memo('Description', 'Description', 10000), text('ResponsibleParty', 'Responsible Party', 200),
    date('DueDate', 'Due Date', true), text('Status', 'Status', 100),
    memo('Impact', 'Impact', 4000), memo('Response', 'Mitigation / Resolution', 4000),
    text('Probability', 'Probability', 100), text('LastReviewId', 'Latest Applied Review ID', 36)
  ])),
  table('RecordChange', 'RAID Change', 'RAID Changes', [
    text('RecordId', 'Official Record ID', 36, true),
    text('Kind', 'Record Type', 100, true),
    text('ChangeType', 'Change Type', 100, true),
    memo('BeforePayload', 'Before Snapshot', 50000),
    memo('AfterPayload', 'After Snapshot', 50000),
    date('ChangedOn', 'Changed On')
  ])
];
export const lookups = [];
for (const t of tables) {
  const name = t.SchemaName.toLowerCase();
  if (name === 'pmdh_person') {
    lookups.push({ table: name, column: 'User', target: 'systemuser', mandatory: false });
    continue;
  }
  lookups.push({ table: name, column: 'Project', target: 'pmdh_project', mandatory: true });
  if (name === 'pmdh_projectmember') {
    lookups.push({ table: name, column: 'Person', target: 'pmdh_person', mandatory: true });
    continue;
  }
  if (name !== 'pmdh_meeting') lookups.push({ table: name, column: 'Meeting', target: 'pmdh_meeting', mandatory: name !== 'pmdh_recordchange' });
  if (name === 'pmdh_recordchange') {
    lookups.push({ table: name, column: 'Proposal', target: 'pmdh_proposal', mandatory: false });
    lookups.push({ table: name, column: 'ChangedBy', target: 'systemuser', mandatory: true });
  }
  if (name === 'pmdh_proposal') {
    lookups.push({ table: name, column: 'Evidence', target: 'pmdh_evidence', mandatory: true });
    lookups.push({ table: name, column: 'ReviewedBy', target: 'systemuser', mandatory: false });
  }
  if (['pmdh_action', 'pmdh_risk', 'pmdh_issue', 'pmdh_dependency'].includes(name)) {
    lookups.push({ table: name, column: 'ResponsiblePerson', target: 'pmdh_person', mandatory: false });
    lookups.push({ table: name, column: 'Evidence', target: 'pmdh_evidence', mandatory: true });
    lookups.push({ table: name, column: 'Proposal', target: 'pmdh_proposal', mandatory: true });
  }
}
lookups.push({ table: 'pmdh_project', column: 'DeliveryTeam', target: 'team', mandatory: false });
export function relationship(l) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${l.table}_${l.column}`, ReferencedEntity: l.target, ReferencingEntity: l.table,
    ReferencingEntityNavigationPropertyName: `pmdh_${l.column}`,
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'Restrict', Merge: 'NoCascade',
      Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
    Lookup: { '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: `pmdh_${l.column}`, DisplayName: label(l.column),
      RequiredLevel: required(l.mandatory) }
  };
}
export const keys = [
  { table: 'pmdh_person', name: 'PersonDirectory', fields: ['pmdh_directorykey'] },
  { table: 'pmdh_person', name: 'PersonUser', fields: ['pmdh_user'] },
  { table: 'pmdh_projectmember', name: 'ProjectPerson', fields: ['pmdh_project', 'pmdh_person'] },
  { table: 'pmdh_meeting', name: 'MeetingSource', fields: ['pmdh_project', 'pmdh_sourcekey'] },
  { table: 'pmdh_proposal', name: 'MeetingCandidate', fields: ['pmdh_meeting', 'pmdh_candidatekey'] }
];
