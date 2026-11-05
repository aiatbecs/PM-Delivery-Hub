# Meeting Review development workflow

## What is ready

Open **PM Delivery Hub > Delivery > Meeting Review**. This increment supports manual Microsoft 365 Copilot extraction into five proposal types: Summary, Action, Risk, Issue, Dependency. No integrated AI endpoint or paid AI processing is called by the app.

1. Select the project. Download or copy the extraction prompt and JSON example.
2. In your approved Microsoft work-account Copilot, provide the transcript/screenshots and the prompt. Treat source text as evidence, not instructions. Review Copilot's output for invented facts, owners, dates, and incorrect citations.
3. Retain originals in approved storage. Use filenames and timestamps/page/region labels as evidence locators. Screenshots are not uploaded to or interpreted by this app.
4. Paste JSON, or load a JSON file of at most 1.5 MB. Click **Validate and import**. Only pending proposals and evidence are created, not official RAID records.
5. Review each evidence excerpt and ordinary editable fields. Choose **Create new** or **Update existing** for RAID proposals; compare the current record snapshot with the proposed fields. Approve or reject. Rejection ignores unsaved field changes. Reload when the app reports a concurrent change.
6. An approved Summary replaces Meeting Summary and Project Current Summary after explicit confirmation. Other approvals create a new official record or update the selected existing one. Approval/application/history is one Dataverse transaction; a failure rolls back the review too.
7. Prepare draft minutes (`.md`) or a follow-up draft (`.eml`). Copy the generated-text preview if downloads are blocked. Email recipients remain blank; nothing is sent or uploaded to SharePoint.

Use synthetic data only until multi-user permissions and data handling are tested. Microsoft 365 Copilot licensing is not automatically a free API entitlement for Power Apps. Integrated processing requires a separately verified, approved deployment/licensing path.

## JSON contract

The in-app prompt and example contain the selected project's actual GUID. Replace the synthetic content and dates; do not reuse the example's meeting key for a real meeting.

```json
{
  "version": 1,
  "projectId": "11111111-1111-1111-1111-111111111111",
  "meeting": {
    "sourceKey": "meeting-001",
    "title": "Synthetic planning meeting",
    "date": null,
    "attendees": "Synthetic PM",
    "transcript": "PM: Prepare the checklist."
  },
  "proposals": [{
    "key": "action-001",
    "type": "Action",
    "payload": {
      "title": "Prepare checklist",
      "description": "Prepare the checklist for review.",
      "responsibleParty": "Synthetic PM",
      "dueDate": null,
      "impact": "",
      "response": "",
      "probability": ""
    },
    "evidence": {
      "sourceName": "synthetic-transcript.txt",
      "locator": "00:01",
      "excerpt": "Prepare the checklist."
    }
  }]
}
```

- One to 50 proposals per import. Unknown fields/types, duplicate candidate keys, mismatched project IDs, missing evidence, overlong fields, and invalid dates are rejected.
- Source and candidate keys accept only letters, digits, underscore, and hyphen, up to 100 characters. Keys are case-sensitive in client comparisons; use consistent casing.
- Do not embed colon-separated timestamps in keys: use `meeting-2026-11-03T140000Z`, not `meeting-2026-11-03T14:00:00Z`. The separate meeting date still uses standard ISO timestamp colons.
- Source filenames accept up to 400 characters; locators accept 200. The filename column capacity was increased after a live import exposed a storage-length mismatch. The complete filename is retained, not silently shortened.
- Meeting date is optional UTC ISO text ending in `Z`; dueDate is an optional real `YYYY-MM-DD` date. Unknown optional values use null/empty text, never invented values.
- Retry with the same sourceKey, candidate keys, meeting metadata, payload, and evidence. Identical existing candidates are skipped; changed existing content is an explicit error. After editing a candidate, the original unedited JSON no longer matches it.
- Do not assign a new key solely to bypass deduplication. New keys represent genuinely new proposals. Duplicate-title warnings compare records across the selected project/type. Choose **Update existing** when the proposal corrects an existing record; automatic fuzzy matching is not implemented.
- Errors scroll into view at the top. Paste input into **Or paste JSON**, not the read-only generated-text preview. An empty import has an explicit instruction.
- Reviewed proposals cannot be edited; new candidates are required for subsequent proposals. An update candidate retains its own evidence/reviewer/time and applies to the original official record without duplicating it.
- `payload.status` is optional text (100 characters), defaulting to Open for backward compatibility. Update is a full replacement of displayed business fields; blank optional values clear existing values. Review the comparison before approving.

## Editing and reviewed corrections

1. Open **Delivery > Actions, Risks, Issues, or Dependencies**. Select the project and click **Load project RAID records**. Lists never intentionally mix projects.
2. Edit Description, Responsible party, Due date, Status, Impact, Mitigation/resolution, Probability, or Title using ordinary fields.
3. **Save changes** applies an operational edit directly, with If-Match concurrency protection and server-generated before/after history. This is a manual edit, not a retroactive change to the original approved proposal.
4. For a separately reviewed correction, select the source Meeting and click **Propose reviewed update**. This creates a Pending candidate with clearly identified PM-manual-correction evidence, the target record/version, and a server snapshot. No transcript quote is invented. The review fields open automatically.
5. Compare, edit, then approve the update. A changed target is blocked until reloaded/reviewed again. Rejecting a stale draft remains possible.
6. **View change history** shows the original approved proposal/evidence, plus creation, manual changes, and subsequent reviewed updates with before/after values, user/time, and review/meeting references. Older changes were not backfilled.

An imported candidate can also be mapped to any available same-project/same-type existing item in Meeting Review. JSON remains version 1; the target is selected in the UI rather than guessed by Copilot.

## Summary replacement and consolidation

Each Summary card displays the current Meeting and Project summaries. Approval requires ticking **I understand approval REPLACES both current summaries**. Summary length is limited to 2,000 characters; stale Meeting/Project ETags block replacement. The prior summaries are captured in the approved proposal's BeforePayload.

For multiple Pending summaries, select **Include in combined summary** on at least two cards, click **Prepare combined summary**, then edit the combined title/text. **Create combined draft and reject selected summaries** atomically creates a new Pending Summary with combined source evidence and source-proposal links, and rejects the selected originals. Nothing is approved yet. Review the new draft and confirm replacement before approving.

This consolidation joins text for human editing; it does not call AI. The extraction prompt now requests at most one consolidated Summary. Approval still handles older multi-summary imports safely through the explicit controls.

## Server and concurrency guarantees

The signed sandbox `PMDeliveryHub.ApprovalGuard` assembly's RAID increment has synchronous PreOperation Create/Update steps on the seven original workflow tables, eight PostOperation RAID Create/Update history steps (Update steps require Before pre-images), and history-table Create/Update/Delete guards: 25 steps. The reporting increment adds 50 DeliveryGuard ownership/directory/membership steps (75 total). RAID history pre-images now include ResponsiblePerson. It validates required source fields, project/meeting/evidence consistency, proposal JSON, supported kinds, target versions, and approval state. Reviewer and UTC review time come from the active initiating human Dataverse user, not imported JSON. Application users cannot approve.

Official RAID creation requires a matching approved proposal, matching content/provenance, and record GUID equal to proposal GUID. Reviewed proposals and evidence provenance/content are immutable on Update. Official record content/status can subsequently be manually updated by users with permission; source lookups stay locked.

The review page uses ETags to reject stale displayed content and competing changes. Active alternate keys prevent duplicate meeting/candidate imports, and primary keys prevent repeated application.

Reviewed updates additionally require a matching approved update proposal, target GUID/version, matching business content, and a new LastReviewId. Original source links are locked. History is written synchronously inside the official record transaction, so history failures roll back record changes. Direct history creation/edit/deletion is blocked; nested transactional writes are checked against the official record/project. Trusted administrators and other custom plugins must remain controlled; this is not cryptographic or administrator-proof auditing.

These guards are not a substitute for authorization. Native owner teams and PMDH roles now scope project access; any active human with project write privileges can review, not only the named PM. Project Role is descriptive, not a separate reviewer authorization policy. The guards do not enforce an atomic paired write for every arbitrary API caller: an authorized caller could approve a proposal without applying it. The supplied UI pairs writes transactionally. Project Current Summary is not protected by this workflow plugin against unrelated direct Project edits. See [REPORTING-ACCESS.md](REPORTING-ACCESS.md) for role/access setup.

Auditing must be enabled and retention configured at environment level. The review fields provide provenance, not a complete tamper-proof audit history. Administrative customization privileges can disable plugins; do not grant them to production end users.

## Synthetic validation completed

- Import seven proposals; zero official RAID records before approval.
- Reimport identical JSON: zero new proposals, seven skipped candidates.
- Approve Summary and all four RAID kinds; edit Action content before approval; resulting Action is Edited and Approved.
- Reject an Action despite malformed unsaved editor text; no record created. One candidate remains Pending for demonstration.
- Verify server reviewer/time on all six reviewed proposals and the persisted Project summary.
- Direct API: unapproved record creation, reviewed-proposal mutation, missing evidence excerpt, and cross-project evidence all blocked.
- Reapplying an existing official GUID and stale ETags rejected with HTTP 412.
- Force official-record creation failure after approval within one changeset: proposal remains Pending with no applied/reviewer fields.
- Change a Pending row after display: review UI refuses stale approval.
- Validate output preview includes approved summary/records and pending count, excludes rejected/pending records, and has an unsent email header with no recipients.
- Node validation tests cover exact proposal/text limits, real/leap dates, unknown fields, evidence, project matching, and multipart transaction errors. Signed plugin build and JavaScript syntax checks pass.
- Import-fix increment: 11 Node tests pass, a synthetic 400-character source filename persists exactly, and empty JSON input displays an explicit visible error. A user-requested 13-proposal import was verified as entirely Pending with 13 evidence rows and complete source filenames; no approvals were performed.
- RAID increment: 14 Node tests cover legacy status normalization, supported-field mapping without source changes, and strict concurrency-token parsing as well as existing import validation.
- Create all four RAID kinds; update each through a reviewed candidate; verify one official record per type, unchanged original approved proposals, and eight linked creation/update history rows.
- Save manual operational changes with before/after history; direct history Create/Update/Delete and repeated review markers are blocked.
- Force a reviewed-update content mismatch: approval and official update roll back together. Change the target after display: server and UI reject stale application; the stale draft can still be rejected.
- Consolidate two summaries: originals become Rejected, combined draft remains Pending until separately approved, evidence/source IDs and prior summaries are retained.
- Change Project summary after display: replacement is blocked until reloaded. Cross-meeting update appears in the newer meeting's drafts while original RAID provenance remains unchanged.
- Verify all four navigation tabs filter project/type, the workspace exposes a newly proposed correction for review, original approval/evidence appears in history, no-change reviewed applications still have a history entry, and cross-project target selection is blocked. Temporary isolation test rows are deleted.
- Summary approval rejects 2,001 characters and persists exactly 2,000 characters after explicit replacement confirmation.

Temporary cross-project test data was deleted. The clearly labeled synthetic demonstration project/meeting remains in development. The downloaded minutes/email files were inspected and contain the expected synthetic content. Real-input extraction, additional-user permissions, and separate-environment restore still require validation.

## Deployment and next integration boundaries

The exported solution is the repeatable component-deployment package; import it through the approved maker portal. The reporting increment includes ten workflow/history/directory/membership tables plus Project, alternate keys/relationships, six web resources, the signed plugin assembly, all 75 steps with required pre-images, security roles and app navigation. After import, bootstrap management and native project teams/memberships as documented in [REPORTING-ACCESS.md](REPORTING-ACCESS.md), check active keys and enabled synchronous steps/pre-images, then rerun synthetic tests before allowing real inputs.

Workflow source is under `PMDeliveryHub/workflow`. `schema.mjs` describes the metadata; `serve-deployment.mjs` serves only loopback development payloads, reads current build/resources on each request, and must be stopped after use. Build the plugin with the original private signing key; never commit or publish that key. Resource changes must be deployed and published; editing source alone does not update the running app. Increment the script version query in `review.html` with each resource release and publish the app module as well as web resources so the app refreshes its resource-version cache.

Before production: establish approved development/test/production environments, use unmanaged development plus managed downstream releases, configure environment-specific connections, enable auditing/retention, test the implemented Project team access with separate users and review additive grants for all child rows, and validate restore/rollback. Importing a solution does not back up rows/files or create project teams.

Corporate Word/Excel/PowerPoint/PDF templates have not been supplied. Document generation currently provides generic drafts only. SharePoint permissions, artifact storage, automatic/fuzzy matching, decisions/prerequisites/scope, and integrated AI remain later increments. Do not enable paid AI or production integrations without verifying licensing, data boundaries, and required external resources.
