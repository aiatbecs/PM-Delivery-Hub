# PM Delivery Hub data model

## Status and scope

This is the initial design for the Power Platform Foundation, drafted from the project plan. Implementation has started in the development environment; the full schema is not yet deployed. Retain the solution publisher `PMDeliveryHub` and customization prefix `pmdh` when creating components in an environment.

The MVP covers project context and the meeting-to-reviewed-updates workflow. Tables marked **Later** can be added after the MVP workflow is validated.

### Implementation checkpoint

- The development solution `PMDeliveryHub` was created with version `1.0.0.0`. Unmanaged milestone `1.0.0.1` preserves the basic Project app; `1.0.0.2` includes the working Meeting Review increment.
- The standard Project table has been created inside the solution with schema name `pmdh_Project` and User or team ownership.
- Its primary text column is Project Name (`pmdh_ProjectName`), Business required, with the portal default maximum length of 850 characters.
- The `account_id`, `TPID`, and `Wave_id` columns have been created and their saved settings verified: Single line of text, Text format, Business required, maximum 100 characters each. They store external identifiers, preserve leading zeros, and allow repeated values across projects.
- Project Number (`pmdh_ProjectNumber`) has been created as an autonumber with prefix `PMDH`, six minimum digits, and initial seed 1. A synthetic project generated `PMDH-000001`, verified again after reopening. Autonumbers can contain gaps and six digits is a minimum, not a cap.
- Customer (required text, 200 characters), Project Manager (required User lookup), Solution Architect (optional User lookup), Stage, Health, Start Date, Target End Date, and Current Summary (optional plain multiline text, 2,000 characters) have been created. Saved types, requirements, lookup targets, choice labels/defaults, and date-only time zone settings were checked.
- Stage is an optional local single-select choice with the six values listed below and no default. Health is an optional local single-select choice with default Not assessed.
- The Project main form (Information) has been saved and published with the business columns and Owner. Project Number is read-only on this form; this is a UI restriction, not an API immutability guarantee.
- The basic PM Delivery Hub model-driven app has been saved and published inside the solution, with Delivery > Projects navigation.
- Active Projects has been saved and published with Project Name, Created On, Project Number, Customer, Project Manager, Stage, Health, account_id, TPID, Wave_id, and Target End Date. Its Active-status filter is unchanged; custom Stage does not change Dataverse status.
- Meeting, Evidence, Proposal, Action, Risk, Issue, and Dependency have been created as standard user/team-owned tables. See the implemented workflow schema below; the later target design is not the exact deployed schema.
- SharePoint Location and other target tables have not been created. Project-team access enforcement is still pending.
- Access is intended for the assigned PM and project team, with portfolio administrators seeing all projects. Ownership alone does not enforce this: security roles and team/sharing behavior still need implementation and testing.
- The environment solution has been exported and unpacked into the local solution source. Local repacking passed; importing into another environment has not been tested. The solution backup does not include the synthetic project row or other business data.

### Basic app validation

- Created and reopened the synthetic record `TEST - PM Delivery Hub validation`; its generated number is `PMDH-000001`.
- Confirmed `account_id` and TPID preserve leading zeros after saving and reopening.
- Confirmed Health defaults to Not assessed and Stage remains unselected.
- Confirmed the saved synthetic project is visible in Active Projects with its generated number.
- Confirmed the main form blocks saving when Project Name, account_id, TPID, Wave_id, Customer, or Project Manager is missing. Testing exposed a Project Name requirement mismatch; its Business required metadata was explicitly saved and the Project table published, then validation passed after refreshing the app.
- The synthetic project remains in development for demonstration; the extra missing-field test was not saved.
- Browser diagnostics reported missing Teams licensing and platform telemetry/resource errors. They did not prevent the tested project operations; Teams integration is not validated or enabled by this milestone.
- Project-level access, API enforcement of required fields, autonumber uniqueness keys, multi-user behavior, and date-range validation have not been tested.

## Design rules

- Dataverse is the system of record for structured project information; SharePoint holds transcripts, source documents, and generated files.
- Every project record belongs to one Project. Relate extracted records to the Meeting and Evidence that support them when applicable.
- AI output is a proposal, not an official project record. Only explicit PM approval can create or update Actions, RAID records, decisions, prerequisites, or scope.
- Keep tenant-specific connection details and secrets out of solution source.
- Use Dataverse's built-in ownership, created/modified, and audit fields where available rather than duplicating them.
- Model internal and external people without requiring external stakeholders to be Dataverse users. Use a Dataverse user lookup for internal assignments where appropriate, plus name/email fields for external contacts.

## Tables

### Implemented meeting workflow schema

All seven new tables have required primary name `pmdh_name` (200 characters). All have required Project lookups; all except Meeting also have required Meeting lookups. Proposal and RAID records require Evidence; RAID records also require Proposal. Lookup deletion is restricted and ownership/share cascades are disabled. Row ownership does not automatically follow Project ownership.

| Table | Deployed content |
|---|---|
| `pmdh_meeting` | SourceKey (required 100-character retry key), MeetingDate (UTC timestamp/User local display), Attendees (4,000), optional Transcript (100,000-character memo), approved Summary (10,000) |
| `pmdh_evidence` | SourceName (required 400) and Locator (required 200), Excerpt (required by guard, 10,000); source content/provenance immutable |
| `pmdh_proposal` | CandidateKey (required 100), Kind (Summary/Action/Risk/Issue/Dependency), Payload (20,000-character JSON memo), ReviewStatus (Pending/Approved/Edited and Approved/Rejected), server-assigned ReviewedBy/ReviewedOn, AppliedId (36); reviewed rows immutable |
| `pmdh_action`, `pmdh_risk`, `pmdh_issue`, `pmdh_dependency` | Description (10,000), ResponsibleParty (200), DueDate (Date only), Status (100-character text, initially Open), Impact/Response (4,000 each), Probability (100-character text); required Project/Meeting/Evidence/Proposal provenance |

The active alternate keys are `pmdh_MeetingSource` (Project + SourceKey) and `pmdh_MeetingCandidate` (Meeting + CandidateKey). Official RAID record IDs equal their proposal IDs, preventing repeated application of the same candidate. An approved Summary updates Meeting Summary and Project Current Summary; the latter imposes a 2,000-character approval limit.

This first increment deliberately uses optional transcript text in Dataverse and text responsible-party/status/probability fields rather than SharePoint URLs, user assignment, and agreed choice scales. Originals and screenshots remain in approved external storage; do not use customer data until storage, retention, auditing, and access are approved. Table audit flags do not enable environment auditing.

### Target table design (not all deployed)

### Project — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project Number | Autonumber | `PMDH-{SEQNUM:6}`, initial seed 1; human-readable identifier; unique alternate key still to be configured |
| Project Name | Text | Primary name |
| account_id | Text, Business required, 100 characters | External account identifier; schema name `pmdh_account_id`; not a Dataverse Account lookup |
| TPID | Text, Business required, 100 characters | External identifier; schema name `pmdh_TPID`; preserves leading zeros |
| Wave_id | Text, Business required, 100 characters | External wave identifier; schema name `pmdh_Wave_id` |
| Customer | Text, Business required, 200 characters | Organization or customer name |
| Project Manager | User lookup, Business required | Internal accountable PM; assignment does not itself grant record access |
| Solution Architect | User lookup, optional | Internal SA when applicable |
| Stage | Local Choice, optional | Executing Pre-requisites, Finalizing Scope, Executing Migration, Deferred by Customer, Cancelled/Archived, Completed; no default |
| Health | Local Choice, optional | Green, Amber, Red, Not assessed; default Not assessed |
| Start Date / Target End Date | Date only, optional | Date-only format and time zone adjustment; no user-local date conversion |
| Current Summary | Plain multiline text, optional, 2,000 characters | Approved, current project context; refreshed from reviewed information |
| SharePoint Location | URL | Project document library or folder |

### Stakeholder — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Name | Text | Stakeholder display name |
| Email | Email | Optional |
| Organization | Text | Customer, partner, or internal organization |
| Role | Text | Project role |
| Influence | Choice | Use an agreed scale, for example Low, Medium, High |
| Communication Preference | Choice or text | Do not infer consent to contact from this value |

### Meeting — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Title | Text | Primary name |
| Meeting Date | Date/time | Meeting time |
| Attendees | Multiline text or related Stakeholder links | Use related records if attendee reporting is needed |
| Transcript Location | URL | SharePoint reference; avoid storing large source transcripts in a text column |
| Summary | Multiline text | AI-generated summary remains marked as unreviewed until accepted |
| Processing Status | Choice | Received, Processing, Needs Review, Reviewed, Failed |
| Source Identifier | Text, optional | External meeting identifier for matching/reprocessing |

### Evidence — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Meeting | Meeting lookup, optional | Source meeting when applicable |
| Source Type | Choice | Transcript, Document, Email, Other |
| Source Location | URL or text | SharePoint link or approved source reference |
| Excerpt | Multiline text | Minimal supporting excerpt needed to review a proposal |
| Locator | Text, optional | Page, timestamp, or other source location |

### AI Proposal — MVP

This staging table is intentionally separate from official project records. Each extracted candidate is reviewable and has a traceable source.

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Meeting | Meeting lookup | Required |
| Evidence | Evidence lookup | Required for factual proposals |
| Proposal Type | Choice | Summary, Action, Risk, Issue, Decision, Dependency, Prerequisite, Scope change |
| Proposed Content | Multiline text | Human-readable proposed change |
| Structured Payload | Multiline text | Optional validated JSON for mapping to target columns; do not treat as executable input |
| Possible Existing Record | Optional related-record reference | Duplicate/match candidate for reviewer comparison |
| Review Status | Choice | Pending, Approved, Edited and Approved, Rejected |
| Reviewed By / Reviewed On | User lookup / date-time | Set when a human makes the review decision |
| Applied Record Reference | Related-record reference, optional | Populate after an approved proposal has been applied |

The application must enforce that a proposal cannot be applied as official project data while Pending or Rejected. Invalid AI output should be surfaced as a processing/review error, not silently discarded or accepted.

### Action — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Description | Multiline text | Primary name can be a concise action title |
| Owner | User lookup, optional | Internal owner |
| External Owner Name / Email | Text / Email, optional | For non-user owners |
| Due Date | Date only, optional | |
| Status | Choice | Proposed records are not created here; use Open, In Progress, Blocked, Completed, Cancelled |
| Source Meeting / Evidence | Lookups, optional | Provenance |
| Completed On | Date only, optional | |

### Risk — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Risk Statement | Multiline text | Describe a possible future event and its effect |
| Probability / Impact | Choice | Agree on an organization-wide scale |
| Mitigation | Multiline text | |
| Owner | User lookup, optional | Internal owner |
| Status | Choice | Open, Mitigating, Accepted, Closed |
| Source Meeting / Evidence | Lookups, optional | Provenance |

### Issue — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Description | Multiline text | Describe an existing problem |
| Impact | Multiline text | |
| Resolution Plan | Multiline text | |
| Owner | User lookup, optional | Internal owner |
| Target Date | Date only, optional | |
| Status | Choice | Open, In Progress, Resolved, Closed |
| Source Meeting / Evidence | Lookups, optional | Provenance |

### Decision — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Decision | Multiline text | The decision made |
| Decision Date | Date only | |
| Decision Maker | Text or stakeholder lookup | Preserve the actual decision-maker |
| Rationale | Multiline text | |
| Source Meeting / Evidence | Lookups, optional | Provenance |

### Dependency — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Description | Multiline text | |
| Responsible Party | Text, optional | Supports external parties |
| Needed By | Date only, optional | |
| Status | Choice | Open, In Progress, Met, At Risk, Closed |
| Source Meeting / Evidence | Lookups, optional | Provenance |

### Prerequisite — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Requirement | Multiline text | Access, environment, data, or other readiness requirement |
| Owner Name / Email | Text / Email, optional | |
| Status | Choice | Not Started, In Progress, Complete, Blocked, Not Required |
| Needed By | Date only, optional | |
| Source Meeting / Evidence | Lookups, optional | Provenance |

### Scope Item — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Description | Multiline text | |
| Scope Direction | Choice | In Scope, Out of Scope |
| Approval Status | Choice | Proposed, Approved, Rejected, Superseded |
| Source Meeting / Evidence | Lookups, optional | Provenance |

Scope changes extracted from a meeting must first be AI Proposals and require human review. They must not overwrite approved scope without an explicit decision.

### Artifact — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Meeting | Meeting lookup, optional | Related meeting minutes |
| Name | Text | Primary name |
| Type | Choice | Meeting Minutes, Other |
| Version | Text | |
| Generated On | Date/time | |
| SharePoint Location | URL | Link to the stored output |
| Approval Status | Choice | Draft, In Review, Approved |

### Communication — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project | Project lookup | Required |
| Meeting | Meeting lookup, optional | |
| Purpose | Choice or text | For example, customer follow-up |
| Recipients | Multiline text or related stakeholders | |
| Subject / Draft Body | Text / Multiline text | |
| Review Status | Choice | Draft, In Review, Approved |
| Sent On | Date/time, optional | MVP creates drafts only; sending requires a separate explicit workflow |

### Milestone — Later

Project lookup, name, baseline date, forecast date, actual completion date, status, and source/evidence references.

### Status Report — Later

Project lookup, reporting period, summary, accomplishments, concerns, next steps, approval status, and generated artifact reference.

## Relationships

- Project 1:N Stakeholders, Meetings, Actions, Risks, Issues, Decisions, Dependencies, Prerequisites, Scope Items, Artifacts, Communications, Evidence, Milestones, and Status Reports.
- Meeting 1:N AI Proposals and Evidence; optionally 1:N extracted records and generated artifacts.
- Evidence 1:N AI Proposals; approved records retain their source meeting/evidence references.
- AI Proposal may reference a possible existing record for duplicate review and an applied record after approval.

Use explicit table lookups for core relations, not comma-separated identifiers in text. Keep optional links optional where records can have multiple supporting sources; add a junction table later if multi-source provenance becomes a reporting requirement.

## Access and approval requirements to settle before deployment

- Define whether users can see all project records or only projects they are assigned to; enforce the decision with Dataverse roles/teams and SharePoint permissions.
- Confirm AI processing is approved for the transcript and document data involved, including retention and audit requirements.
- Confirm the organization's risk/impact scales, project stage choices, status values, and required fields.
- Confirm whether transcript files should remain in SharePoint and what excerpt content may be copied into Dataverse for review.
- Confirm that approval and sending of communications are distinct actions; the MVP must not automatically send email.
