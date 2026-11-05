# Project and owner reporting

## Using the dashboard

Open **Delivery > Project dashboard** and choose **Project dashboard**, **Owner dashboard**, or **My items** in the View selector.

- Project view shows PM, stage, health, open counts for all four RAID types, overdue items, and the selected project's current summary.
- Owner view shows a person's totals across accessible projects, followed by their per-project breakdown. Open actions and total actions are separate columns.
- My items uses the directory person's linked Dataverse user ID, not a name or email comparison.
- Project/person filters and count buttons drill into the record table. The table shows structured responsibility, original responsible-party text, status, due date, impact and mitigation.
- Refresh reloads all accessible rows with paging. Totals are current item counts, not effort/capacity estimates. Different API requests are not a transactionally consistent portfolio snapshot.

Only official records in Action, Risk, Issue and Dependency are counted. Pending/rejected proposals, repeated meeting mentions and history entries do not increase totals. Reviewed updates keep the same official ID.

The status vocabulary is Open, In progress, Blocked, Monitoring, Closed, Resolved and Cancelled. The last three are terminal. Missing legacy status means Open; unsupported statuses fail reporting explicitly rather than being silently counted.

The reporting date defaults to the browser's local calendar date. Overdue means an open record with a due date strictly before that date. Upcoming means today through seven days later, inclusive. Closed records are not overdue. Changing the date changes deadline calculations; it does not reconstruct historical record state.

## People and responsibility

Management users see the people/membership section on the dashboard.

1. Create a person with a unique stable directory key and name. Work email is optional.
2. Optionally link an active human Dataverse account. One account can map to at most one person.
3. Add the person to each project, with a descriptive project role such as Developer, PM or Solution Architect.
4. In Meeting Review or a RAID workspace, explicitly select **Responsible person** from project members.

External people without an app account can be assigned delivery work but cannot sign in. Linking or unlinking an account synchronizes membership in all that person's project teams. Existing people can be edited with optimistic concurrency; directory keys do not change.

Responsible Party remains source text; it is not an identity and is never automatically matched. Existing official items remain unassigned until explicitly mapped. Downloads display the assigned directory name, or Unassigned with the retained source text.

Responsible Person is included in approved payload comparison and before/after history. An update replaces all displayed fields, including this assignment. Removing a project membership revokes its team access; it does not erase previous assignments or history. Reassign a former member's items before further edits.

## Dataverse access

Each project has a server-managed owner team and DeliveryTeam lookup. All project workflow records, including evidence, proposals, membership and history, belong to that same team.

- **PMDH Project Member** grants Basic (user/team-owned) privileges on project/workflow tables, and organization-level read/append-to on the people directory. It does not grant management of people or project memberships.
- **PMDH Management** grants portfolio-wide custom-table access and directory/membership management. Assign this role directly to designated users.
- New projects are created by management. A synchronous plugin creates their owner team, assigns the member role, and sets project ownership. Workflow creates use the project's team.
- Membership creation/removal and account relinking synchronously synchronize native team membership. External directory people do not receive login access.
- All linked project members receive the same project editing/review privileges. Project Role is descriptive; PM-only approval and read-only membership variants are not implemented.
- Structured assignments must belong to the project. Unsupported statuses and cross-project assignments are rejected on the server.
- Client UI visibility is not the access boundary. Native Dataverse privileges and owner teams enforce row access, including outside the dashboard.

No users besides the current authenticated development user were granted the management role during this increment. No other person's security roles or license assignments were changed.

### Before sharing

An environment administrator must verify licensing, provide the normal model-driven-app/base-user privileges, and grant app access for the appropriate PMDH roles. Project members receive their project role through owner-team membership; My items still requires a linked directory identity.

Dataverse roles and explicit shares are additive. Existing broader roles, hierarchy security, shared rows or administrative access may allow more than the project's team grants. Review effective access for each intended user before sharing. System administrators remain privileged; this is not administrator-proof isolation.

Do not enable production sharing based only on the current administrator's dashboard. Test a member and a manager sign-in, denied cross-project API access, membership removal, app access, and any additional roles/hierarchy/sharing policies.

## Deployment and restore

Source is under `PMDeliveryHub/workflow`. `deploy-dashboard.js` is a customization deployment function for an already authenticated, approved Dataverse browser origin. It provisions schema, keys, roles, owner teams, guard steps and resources; it does not authenticate or call an AI service. The loopback payload helper must be stopped after deployment.

Role/bootstrap and project ownership migration require customization/security administration. The migration changes security ownership, not proposal approvals or business payloads. Existing historical rows are not backfilled with invented business changes.

The solution package contains schema, roles, code, plugin registrations and dashboard navigation. It does not include directory people, project memberships, team rows, team membership, user-role assignments or project data. After restoring components, bootstrap designated management, provision each restored project's team, migrate its records and recreate approved memberships. Validate role names/business-unit copies and signing identity.

## Validation

- Automated tests verify identity bindings, status validation, owner/project sum equality, unassigned counts, duplicate-record rejection, all four types, and exact overdue/upcoming boundaries.
- Live synthetic example: Developer-1 has two open actions in the first test project and one in the second; owner total is three, overdue two and upcoming one.
- Native effective-access checks verify the second project's owner team can read/write that project and has no access to the other projects.
- Live creation/approval validates project team provisioning, evidence/proposal/official ownership, and structured responsibility.
- Account linking makes My items show the three test actions; unlinking removes team membership and restores an empty My items view. Membership removal/recreation synchronizes native team membership; a person outside the project's membership is rejected as an assignee. All four RAID types record structured assignment changes.
- A reviewed correction retains its structured assignment and records it in history without duplicating the official action. Server status validation rejects Done. Unassigned filtering survives refresh; report errors clear displayed totals and require a fresh successful load.

Separate non-administrator sign-in and production access-policy acceptance remain required.
