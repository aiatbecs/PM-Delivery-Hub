# MVP: Meeting to reviewed project updates

## Goal

Prove one useful, auditable workflow before building the full artifact factory:

> Select a project, provide a meeting transcript, review AI-proposed updates, approve selected changes, then create meeting minutes and a follow-up email draft.

The AI proposes. A project manager reviews and approves. AI output must not silently become an official project record or send a communication.

## Implemented development increment

The Project app and manual-Copilot review workflow are deployed. Supported proposal types are **Summary, Action, Risk, Issue, Dependency**. Evidence-backed pending proposals are imported from JSON; approval applies edited content transactionally, rejection creates no official record, and reviewer/time are recorded server-side. Meeting minutes and follow-up email are generic local drafts with a copyable preview, not SharePoint artifacts or corporate templates.

This is an increment toward the acceptance criteria below, not completion of the entire MVP. Stakeholders, decisions, prerequisites, scope changes, SharePoint artifact registration, integrated AI, and tested project-team permissions remain outstanding. See [MEETING-WORKFLOW.md](MEETING-WORKFLOW.md) for current behavior and synthetic validation.

Milestone `1.0.0.4` adds explicit matching to an existing same-project/same-type RAID record, reviewed updates without duplicates, operational record editing, before/after change history, stale-update rejection, and summary consolidation/replacement confirmation. Automatic/fuzzy matching, corporate templates, and SharePoint outputs remain outstanding.

Milestone `1.0.0.5` adds people/project memberships, explicit responsible-person assignments, project/owner/My items dashboards, and native Dataverse team/role access. Production access acceptance still requires separate member/manager sign-ins and auditing existing additive grants. See [REPORTING-ACCESS.md](REPORTING-ACCESS.md).

## Initial records

All records are associated with a project. Keep structured information in Dataverse rather than burying it in a single project narrative.

| Record | MVP information |
|---|---|
| Project | Project identifier, customer, title, owner, stage, health, dates, current summary |
| Stakeholder | Name, organization, role, communication preference |
| Meeting | Project, title, date, attendees, transcript/source, summary |
| Action | Description, owner, due date, status, source meeting |
| Risk | Statement, probability, impact, mitigation, owner, status, source |
| Issue | Description, impact, resolution plan, owner, target date, status, source |
| Decision | Decision, date, decision-maker, rationale, source |
| Dependency | Description, responsible party, needed-by date, status, source |
| Prerequisite | Requirement, owner, status, source |
| Artifact | Type, version, generated date, SharePoint link, approval status |
| Evidence | Source file or meeting reference supporting an extracted record |

Use Dataverse relationships to connect each record to its project and, where applicable, the meeting/evidence that supports it. Avoid duplicating project facts into disconnected free-text records.

## Workflow

1. **Select project:** Show the PM the current summary, open actions, risks/issues, decisions, prerequisites, and relevant project documents.
2. **Provide meeting input:** The PM selects or uploads a transcript and confirms meeting metadata. Automated Teams transcript retrieval is not required for the first iteration.
3. **Generate proposals:** Produce a summary and candidate actions, risks, issues, decisions, dependencies, prerequisites, and scope changes. Include source evidence for each proposal.
4. **Review:** Present proposals with their evidence and possible matches to existing records. The PM can approve, edit, or reject each one.
5. **Apply approved changes:** Create or update only records the PM approved. Record the reviewer and review time, and retain the source meeting/evidence.
6. **Create outputs:** Generate meeting minutes in the project's SharePoint library and prepare (but do not send) a follow-up email draft.
7. **Update context:** Refresh the project's current summary from approved records and show what changed.

## Acceptance criteria

- A PM can create and open a project and see its related records in one workspace.
- A transcript can be associated with the correct project and meeting.
- The generated summary and each proposed update can be traced to source evidence.
- No proposed action, RAID item, decision, prerequisite, or scope change is persisted as approved without an explicit PM action.
- The PM can edit or reject proposals; approved records link back to the source meeting.
- Reprocessing a meeting does not create duplicate records without warning or a reviewable match.
- Meeting minutes are saved to the correct project's SharePoint location and recorded as an artifact.
- The follow-up email is a draft for human review and is never sent automatically.
- Access to project content follows the approved project permissions; AI retrieval must not expose another project's content.

## Not in the first workflow

- Automatic ingestion of Teams transcripts, Outlook threads, or SharePoint files
- Automatic email sending or automatic approval of AI-proposed changes
- Status/FDO reports, kickoff packs, handover/closure documents, and lessons learned
- Azure DevOps synchronization and advanced Power BI portfolio reporting
- Custom Azure AI services, unless Copilot Studio and approved Microsoft 365 capabilities cannot meet validated requirements

## Decisions required before environment implementation

- Development and production Dataverse environments, solution publisher, and deployment process
- Project-level access model and SharePoint library structure
- Approved AI service, data boundaries, retention, and audit requirements
- Transcript and email access/consent model
- Existing prompt library, document templates, and required corporate terminology
