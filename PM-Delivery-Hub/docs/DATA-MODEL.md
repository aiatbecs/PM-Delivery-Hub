# PM Delivery Hub data model

## Status and scope

This is the initial design for the Power Platform Foundation, drafted from the project plan. It is not yet a deployed Dataverse schema. Retain the solution publisher `PMDeliveryHub` and customization prefix `pmdh` when creating components in an environment.

The MVP covers project context and the meeting-to-reviewed-updates workflow. Tables marked **Later** can be added after the MVP workflow is validated.

## Design rules

- Dataverse is the system of record for structured project information; SharePoint holds transcripts, source documents, and generated files.
- Every project record belongs to one Project. Relate extracted records to the Meeting and Evidence that support them when applicable.
- AI output is a proposal, not an official project record. Only explicit PM approval can create or update Actions, RAID records, decisions, prerequisites, or scope.
- Keep tenant-specific connection details and secrets out of solution source.
- Use Dataverse's built-in ownership, created/modified, and audit fields where available rather than duplicating them.
- Model internal and external people without requiring external stakeholders to be Dataverse users. Use a Dataverse user lookup for internal assignments where appropriate, plus name/email fields for external contacts.

## Tables

### Project — MVP

| Column | Suggested Dataverse type | Notes |
|---|---|---|
| Project Number | Autonumber | Human-readable identifier; unique alternate key if the chosen format is stable |
| Project Name | Text | Primary name |
| Customer | Text | Organization or customer name |
| Project Manager | User lookup | Internal accountable PM |
| Solution Architect | User lookup, optional | Internal SA when applicable |
| Stage | Choice | Initiating, Planning, Executing, Monitoring/Control, Closing |
| Health | Choice | Green, Amber, Red, Not assessed |
| Start Date / Target End Date | Date only | Target dates |
| Current Summary | Multiline text | Approved, current project context; refreshed from reviewed information |
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
