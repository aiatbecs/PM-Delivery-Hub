using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PMDeliveryHub
{
    public sealed class ApprovalGuard : IPlugin
    {
        private const int Pending = 425070000;
        private static readonly string[] Kinds = { "Summary", "Action", "Risk", "Issue", "Dependency" };
        private static readonly Dictionary<string, string> Fields = new Dictionary<string, string> {
            { "pmdh_name", "title" }, { "pmdh_description", "description" },
            { "pmdh_responsibleparty", "responsibleParty" }, { "pmdh_impact", "impact" },
            { "pmdh_response", "response" }, { "pmdh_probability", "probability" }, { "pmdh_status", "status" }
        };

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            trace.Trace("PMDH guard: {0} {1} stage {2}", context.MessageName, context.PrimaryEntityName, context.Stage);
            if (context.Stage == 20 && context.MessageName == "Update" &&
                context.InputParameters["Target"] is Entity ownership && ownership.Contains("ownerid") &&
                ownership.Attributes.Keys.All(k => new[] { "ownerid", ownership.LogicalName + "id", "owningbusinessunit",
                    "modifiedon", "modifiedby", "modifiedonbehalfby" }.Contains(k)))
            {
                var row = service.Retrieve(ownership.LogicalName, ownership.Id, new ColumnSet("pmdh_project"));
                var projectTeam = service.Retrieve("pmdh_project", Reference(row, "pmdh_project", "pmdh_project").Id,
                    new ColumnSet("pmdh_deliveryteam")).GetAttributeValue<EntityReference>("pmdh_deliveryteam");
                if (projectTeam == null || ownership.GetAttributeValue<EntityReference>("ownerid")?.Id != projectTeam.Id ||
                    !DeliveryGuard.IsManager(service, context.InitiatingUserId))
                    throw new InvalidPluginExecutionException("Only management may migrate ownership to the project's security team.");
                return;
            }
            if (context.PrimaryEntityName == "pmdh_recordchange")
            {
                if (context.MessageName != "Create" || context.Depth < 2 || !context.IsInTransaction)
                    throw new InvalidPluginExecutionException("RAID history is server-generated and cannot be created, edited or deleted directly.");
                var history = (Entity)context.InputParameters["Target"];
                var kind = history.GetAttributeValue<string>("pmdh_kind");
                if (!IsRaid("pmdh_" + kind) || !Guid.TryParse(history.GetAttributeValue<string>("pmdh_recordid"), out var recordId))
                    throw new InvalidPluginExecutionException("History requires a valid official RAID record.");
                var record = service.Retrieve("pmdh_" + kind, recordId, new ColumnSet(true));
                if (Snapshot(record) != history.GetAttributeValue<string>("pmdh_afterpayload") ||
                    Reference(record, "pmdh_project", "pmdh_project").Id != Reference(history, "pmdh_project", "pmdh_project").Id)
                    throw new InvalidPluginExecutionException("History must match the current official record and project.");
                history["pmdh_changedby"] = new EntityReference("systemuser", context.InitiatingUserId);
                history["pmdh_changedon"] = DateTime.UtcNow;
                return;
            }
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                throw new InvalidPluginExecutionException("PM Delivery Hub guard requires an entity target.");
            if (context.Stage == 40)
            {
                WriteHistory(service, context, target);
                return;
            }
            var current = context.MessageName == "Update"
                ? service.Retrieve(target.LogicalName, target.Id, new ColumnSet(true))
                : new Entity(target.LogicalName, target.Id);
            var combined = new Entity(target.LogicalName, target.Id);
            foreach (var pair in current.Attributes) combined[pair.Key] = pair.Value;
            foreach (var pair in target.Attributes) combined[pair.Key] = pair.Value;
            var project = Reference(combined, "pmdh_project", "pmdh_project");
            RequiredText(combined, "pmdh_name");
            if (target.LogicalName == "pmdh_meeting")
            {
                RequiredKey(combined, "pmdh_sourcekey");
                if (context.MessageName == "Update") Immutable(target, current, "pmdh_project", "pmdh_sourcekey");
                return;
            }
            var meeting = Reference(combined, "pmdh_meeting", "pmdh_meeting");
            SameProject(service, meeting, project);
            if (target.LogicalName == "pmdh_evidence")
            {
                foreach (var field in new[] { "pmdh_sourcename", "pmdh_locator", "pmdh_excerpt" }) RequiredText(combined, field);
                if (context.MessageName == "Update") Immutable(target, current,
                    "pmdh_project", "pmdh_meeting", "pmdh_sourcename", "pmdh_locator", "pmdh_excerpt");
                return;
            }
            var evidence = Reference(combined, "pmdh_evidence", "pmdh_evidence");
            var source = service.Retrieve("pmdh_evidence", evidence.Id, new ColumnSet("pmdh_project", "pmdh_meeting"));
            if (Reference(source, "pmdh_project", "pmdh_project").Id != project.Id ||
                Reference(source, "pmdh_meeting", "pmdh_meeting").Id != meeting.Id)
                throw new InvalidPluginExecutionException("Evidence must belong to the selected project and meeting.");
            if (target.LogicalName == "pmdh_proposal")
            {
                GuardProposal(service, context, target, current, combined, project, meeting);
                return;
            }
            if (!IsRaid(target.LogicalName)) throw new InvalidPluginExecutionException("Unsupported guarded table.");
            var origin = Reference(combined, "pmdh_proposal", "pmdh_proposal");
            if (context.MessageName == "Update")
            {
                Immutable(target, current, "pmdh_project", "pmdh_meeting", "pmdh_evidence", "pmdh_proposal");
                if (target.Contains("pmdh_lastreviewid"))
                {
                    if (!Guid.TryParse(target.GetAttributeValue<string>("pmdh_lastreviewid"), out var reviewId) ||
                        target.GetAttributeValue<string>("pmdh_lastreviewid") == current.GetAttributeValue<string>("pmdh_lastreviewid"))
                        throw new InvalidPluginExecutionException("A new approved update proposal is required for this review marker.");
                    var proposal = Approved(service, reviewId, target.LogicalName, project);
                    if (proposal.GetAttributeValue<string>("pmdh_targetrecordid") != target.Id.ToString() ||
                        proposal.GetAttributeValue<string>("pmdh_targetversion") != Version(current) ||
                        proposal.GetAttributeValue<string>("pmdh_appliedid") != target.Id.ToString())
                        throw new InvalidPluginExecutionException("Update target changed since review. Reload and review a new snapshot.");
                    MatchContent(combined, ValidatePayload(proposal));
                }
                else ValidatePayload(new Entity("pmdh_proposal") { ["pmdh_payload"] = Snapshot(combined) });
                return;
            }
            var approved = Approved(service, origin.Id, target.LogicalName, project);
            if (!string.IsNullOrEmpty(approved.GetAttributeValue<string>("pmdh_targetrecordid")) || target.Id != origin.Id)
                throw new InvalidPluginExecutionException("Official record ID must equal its new-record proposal ID.");
            foreach (var field in new[] { "pmdh_meeting", "pmdh_evidence" })
                if (Reference(combined, field, field).Id != Reference(approved, field, field).Id)
                    throw new InvalidPluginExecutionException("Record provenance must match its approved proposal.");
            MatchContent(combined, ValidatePayload(approved));
            if (target.Contains("pmdh_lastreviewid") && target.GetAttributeValue<string>("pmdh_lastreviewid") != origin.Id.ToString())
                throw new InvalidPluginExecutionException("Initial review marker must equal proposal ID.");
            target["pmdh_lastreviewid"] = origin.Id.ToString();
        }

        private static void GuardProposal(IOrganizationService service, IPluginExecutionContext context, Entity target,
            Entity current, Entity combined, EntityReference project, EntityReference meeting)
        {
            RequiredKey(combined, "pmdh_candidatekey");
            var kind = combined.GetAttributeValue<OptionSetValue>("pmdh_kind")?.Value - Pending;
            if (!kind.HasValue || kind < 0 || kind > 4) throw new InvalidPluginExecutionException("A supported proposal type is required.");
            var state = combined.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value ?? Pending;
            if (context.MessageName == "Create" && state != Pending) throw new InvalidPluginExecutionException("New proposals must be Pending.");
            if (context.MessageName == "Update")
            {
                Immutable(target, current, "pmdh_project", "pmdh_meeting", "pmdh_evidence", "pmdh_candidatekey", "pmdh_kind", "pmdh_sourcecandidates");
                if ((current.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value ?? Pending) != Pending)
                    throw new InvalidPluginExecutionException("Reviewed proposals are immutable. Submit a new candidate for changes.");
            }
            var payload = ValidatePayload(combined);
            var personId = Read(payload, "responsiblePersonId");
            if (state != Pending + 3 && personId.Length != 0)
            {
                if (kind == 0) throw new InvalidPluginExecutionException("Summaries cannot assign a delivery person.");
                var member = new QueryExpression("pmdh_projectmember") { ColumnSet = new ColumnSet(false), TopCount = 1 };
                member.Criteria.AddCondition("pmdh_project", ConditionOperator.Equal, project.Id);
                member.Criteria.AddCondition("pmdh_person", ConditionOperator.Equal, Guid.Parse(personId));
                if (service.RetrieveMultiple(member).Entities.Count != 1)
                    throw new InvalidPluginExecutionException("Responsible person must belong to this project.");
            }
            if (state < Pending || state > Pending + 3) throw new InvalidPluginExecutionException("Invalid proposal review status.");
            var sourceIds = combined.GetAttributeValue<string>("pmdh_sourcecandidates");
            if (context.MessageName == "Create" && !string.IsNullOrEmpty(sourceIds))
            {
                if (kind != 0) throw new InvalidPluginExecutionException("Only summaries may consolidate source candidates.");
                string[] ids;
                try { ids = new JavaScriptSerializer().Deserialize<string[]>(sourceIds); }
                catch (ArgumentException) { throw new InvalidPluginExecutionException("Invalid consolidated candidate references."); }
                if (ids == null || ids.Length < 2 || ids.Length > 50 || ids.Distinct().Count() != ids.Length)
                    throw new InvalidPluginExecutionException("Consolidation requires 2 to 50 distinct summaries.");
                foreach (var id in ids)
                {
                    if (!Guid.TryParse(id, out var guid)) throw new InvalidPluginExecutionException("Invalid source candidate ID.");
                    var row = service.Retrieve("pmdh_proposal", guid, new ColumnSet("pmdh_kind", "pmdh_project", "pmdh_meeting", "pmdh_reviewstatus"));
                    if (row.GetAttributeValue<OptionSetValue>("pmdh_kind")?.Value != Pending ||
                        row.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value != Pending ||
                        Reference(row, "pmdh_project", "pmdh_project").Id != project.Id ||
                        Reference(row, "pmdh_meeting", "pmdh_meeting").Id != meeting.Id)
                        throw new InvalidPluginExecutionException("Consolidated sources must be Pending summaries of the same meeting/project.");
                }
            }
            var targetId = combined.GetAttributeValue<string>("pmdh_targetrecordid");
            Entity record = null;
            if (!string.IsNullOrEmpty(targetId) && state != Pending + 3)
            {
                if (kind == 0 || !Guid.TryParse(targetId, out var guid)) throw new InvalidPluginExecutionException("Only RAID proposals may target an existing record.");
                record = service.Retrieve("pmdh_" + Kinds[kind.Value].ToLowerInvariant(), guid, new ColumnSet(true));
                if (Reference(record, "pmdh_project", "pmdh_project").Id != project.Id)
                    throw new InvalidPluginExecutionException("Update target must belong to the selected project.");
                if (Version(record) != combined.GetAttributeValue<string>("pmdh_targetversion"))
                    throw new InvalidPluginExecutionException("Update target changed since displayed. Reload its snapshot before reviewing.");
            }
            else if (string.IsNullOrEmpty(targetId) && !string.IsNullOrEmpty(combined.GetAttributeValue<string>("pmdh_targetversion")))
                throw new InvalidPluginExecutionException("Target version requires an update target.");
            target["pmdh_beforepayload"] = state == Pending + 3 ? current.GetAttributeValue<string>("pmdh_beforepayload") :
                record == null ? null : Snapshot(record);
            if (state == Pending)
            {
                if (!string.IsNullOrEmpty(combined.GetAttributeValue<string>("pmdh_appliedid")))
                    throw new InvalidPluginExecutionException("Pending proposals cannot reference applied records.");
                target["pmdh_reviewstatus"] = new OptionSetValue(Pending);
                target["pmdh_reviewedby"] = null;
                target["pmdh_reviewedon"] = null;
                return;
            }
            Human(service, context.InitiatingUserId);
            target["pmdh_reviewedby"] = new EntityReference("systemuser", context.InitiatingUserId);
            target["pmdh_reviewedon"] = DateTime.UtcNow;
            if (state == Pending + 3)
            {
                if (!string.IsNullOrEmpty(combined.GetAttributeValue<string>("pmdh_appliedid")))
                    throw new InvalidPluginExecutionException("Rejected proposals cannot be applied.");
                return;
            }
            var expected = record?.Id ?? target.Id;
            if (!Guid.TryParse(combined.GetAttributeValue<string>("pmdh_appliedid"), out var applied) || applied != expected)
                throw new InvalidPluginExecutionException("Applied ID must match the new proposal or update target.");
            if (kind == 0)
            {
                var m = service.Retrieve("pmdh_meeting", meeting.Id, new ColumnSet("pmdh_summary"));
                var p = service.Retrieve("pmdh_project", project.Id, new ColumnSet("pmdh_currentsummary"));
                target["pmdh_beforepayload"] = new JavaScriptSerializer().Serialize(new {
                    meetingSummary = m.GetAttributeValue<string>("pmdh_summary") ?? "",
                    projectSummary = p.GetAttributeValue<string>("pmdh_currentsummary") ?? ""
                });
            }
        }

        private static Entity Approved(IOrganizationService service, Guid id, string table, EntityReference project)
        {
            var row = service.Retrieve("pmdh_proposal", id, new ColumnSet(true));
            var review = row.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value;
            var kind = row.GetAttributeValue<OptionSetValue>("pmdh_kind")?.Value - Pending;
            if (review != Pending + 1 && review != Pending + 2)
                throw new InvalidPluginExecutionException("Only human-approved proposals may apply official RAID records.");
            if (!kind.HasValue || kind < 1 || kind > 4 || table != "pmdh_" + Kinds[kind.Value].ToLowerInvariant() ||
                Reference(row, "pmdh_project", "pmdh_project").Id != project.Id)
                throw new InvalidPluginExecutionException("Record type/project must match its approved proposal.");
            return row;
        }

        private static void WriteHistory(IOrganizationService service, IPluginExecutionContext context, Entity target)
        {
            if (!IsRaid(target.LogicalName)) throw new InvalidPluginExecutionException("History requires a RAID record.");
            Entity before = null;
            if (context.MessageName == "Update" && !context.PreEntityImages.TryGetValue("Before", out before))
                throw new InvalidPluginExecutionException("RAID history pre-image missing; update cannot be safely recorded.");
            var after = service.Retrieve(target.LogicalName, target.Id, new ColumnSet(true));
            var previous = before == null ? "" : Snapshot(before);
            var next = Snapshot(after);
            if (previous == next && !target.Contains("pmdh_lastreviewid")) return;
            var reviewText = context.MessageName == "Create"
                ? Reference(after, "pmdh_proposal", "pmdh_proposal").Id.ToString()
                : target.GetAttributeValue<string>("pmdh_lastreviewid");
            var history = new Entity("pmdh_recordchange") {
                ["pmdh_name"] = (context.MessageName + ": " + after.GetAttributeValue<string>("pmdh_name")).Substring(0,
                    Math.Min(200, (context.MessageName + ": " + after.GetAttributeValue<string>("pmdh_name")).Length)),
                ["pmdh_project"] = Reference(after, "pmdh_project", "pmdh_project"),
                ["pmdh_recordid"] = target.Id.ToString(), ["pmdh_kind"] = target.LogicalName.Substring(5),
                ["pmdh_changetype"] = before == null ? "Created from approval" : string.IsNullOrEmpty(reviewText) ? "Manual edit" : "Reviewed update",
                ["pmdh_beforepayload"] = previous, ["pmdh_afterpayload"] = next,
                ["pmdh_changedby"] = new EntityReference("systemuser", context.InitiatingUserId), ["pmdh_changedon"] = DateTime.UtcNow
            };
            if (!string.IsNullOrEmpty(reviewText))
            {
                var proposal = service.Retrieve("pmdh_proposal", Guid.Parse(reviewText), new ColumnSet("pmdh_meeting"));
                history["pmdh_proposal"] = proposal.ToEntityReference();
                history["pmdh_meeting"] = Reference(proposal, "pmdh_meeting", "pmdh_meeting");
            }
            else history["pmdh_meeting"] = Reference(after, "pmdh_meeting", "pmdh_meeting");
            service.Create(history);
        }

        private static bool IsRaid(string name) => Kinds.Skip(1).Any(k => name == "pmdh_" + k.ToLowerInvariant());
        private static string Version(Entity row)
        {
            var value = row.RowVersion ?? (row.Contains("versionnumber") ? Convert.ToString(row["versionnumber"], CultureInfo.InvariantCulture) : null);
            if (string.IsNullOrEmpty(value)) throw new InvalidPluginExecutionException("Record concurrency version unavailable.");
            return value;
        }
        private static void Human(IOrganizationService service, Guid id)
        {
            var row = service.Retrieve("systemuser", id, new ColumnSet("applicationid", "isdisabled"));
            if (row.GetAttributeValue<Guid>("applicationid") != Guid.Empty || row.GetAttributeValue<bool>("isdisabled"))
                throw new InvalidPluginExecutionException("Review requires an active human user.");
        }
        private static EntityReference Reference(Entity entity, string field, string expected)
        {
            var value = entity.GetAttributeValue<EntityReference>(field);
            if (value == null || value.Id == Guid.Empty || value.LogicalName != expected)
                throw new InvalidPluginExecutionException(field + " is required and must reference " + expected + ".");
            return value;
        }
        private static void RequiredText(Entity entity, string field)
        {
            if (string.IsNullOrWhiteSpace(entity.GetAttributeValue<string>(field)))
                throw new InvalidPluginExecutionException(field + " requires nonempty text.");
        }
        private static void RequiredKey(Entity entity, string field)
        {
            RequiredText(entity, field);
            if (!Regex.IsMatch(entity.GetAttributeValue<string>(field), "^[a-zA-Z0-9_-]+$"))
                throw new InvalidPluginExecutionException(field + " must contain only letters, digits, underscore or hyphen.");
        }
        private static void SameProject(IOrganizationService service, EntityReference record, EntityReference project)
        {
            var row = service.Retrieve(record.LogicalName, record.Id, new ColumnSet("pmdh_project"));
            if (Reference(row, "pmdh_project", "pmdh_project").Id != project.Id)
                throw new InvalidPluginExecutionException("Meeting belongs to a different project.");
        }
        private static void Immutable(Entity target, Entity current, params string[] fields)
        {
            foreach (var field in fields)
            {
                if (!target.Contains(field)) continue;
                var before = current.Contains(field) ? current[field] : null;
                var after = target[field];
                if (!(before is EntityReference b && after is EntityReference a ? b.Id == a.Id && b.LogicalName == a.LogicalName : Equals(before, after)))
                    throw new InvalidPluginExecutionException("Source field cannot change: " + field);
            }
        }
        private static string Read(Dictionary<string, object> data, string key)
        {
            if (!data.TryGetValue(key, out var value) || value == null) return key == "status" ? "Open" : "";
            if (!(value is string text)) throw new InvalidPluginExecutionException("Proposal fields must be text: " + key);
            return key == "status" && text.Length == 0 ? "Open" : text;
        }
        private static Dictionary<string, object> ValidatePayload(Entity proposal)
        {
            Dictionary<string, object> data;
            try { data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(proposal.GetAttributeValue<string>("pmdh_payload") ?? ""); }
            catch (ArgumentException) { throw new InvalidPluginExecutionException("Proposal payload must be valid JSON."); }
            var allowed = Fields.Values.Concat(new[] { "dueDate", "responsiblePersonId" }).ToArray();
            if (data == null || data.Keys.Any(k => !allowed.Contains(k)) || string.IsNullOrWhiteSpace(Read(data, "title")) ||
                string.IsNullOrWhiteSpace(Read(data, "description"))) throw new InvalidPluginExecutionException("Invalid proposal payload fields.");
            foreach (var pair in new Dictionary<string, int> { { "title", 200 }, { "description", 10000 }, { "responsibleParty", 200 },
                { "impact", 4000 }, { "response", 4000 }, { "probability", 100 }, { "dueDate", 10 }, { "status", 100 } })
                if (Read(data, pair.Key).Length > pair.Value) throw new InvalidPluginExecutionException("Proposal field exceeds maximum length: " + pair.Key);
            var due = Read(data, "dueDate");
            if (!new[] { "Open", "In progress", "Blocked", "Monitoring", "Closed", "Resolved", "Cancelled" }.Contains(Read(data, "status")))
                throw new InvalidPluginExecutionException("Select a supported delivery status.");
            var person = Read(data, "responsiblePersonId");
            if (person.Length != 0 && !Guid.TryParse(person, out _))
                throw new InvalidPluginExecutionException("Responsible person must be a valid directory ID.");
            if (due.Length != 0 && !DateTime.TryParseExact(due, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                throw new InvalidPluginExecutionException("Proposal dueDate must be a real YYYY-MM-DD date.");
            return data;
        }
        private static void MatchContent(Entity record, Dictionary<string, object> data)
        {
            if ((record.GetAttributeValue<EntityReference>("pmdh_responsibleperson")?.Id.ToString() ?? "") != Read(data, "responsiblePersonId"))
                throw new InvalidPluginExecutionException("Responsible person must match the approved proposal.");
            foreach (var pair in Fields)
                if ((record.GetAttributeValue<string>(pair.Key) ?? (pair.Key == "pmdh_status" ? "Open" : "")) != Read(data, pair.Value))
                    throw new InvalidPluginExecutionException("Official content must match the approved proposal: " + pair.Key);
            var due = Read(data, "dueDate");
            var actual = record.GetAttributeValue<DateTime?>("pmdh_duedate");
            if (due.Length == 0 ? actual.HasValue : !actual.HasValue || actual.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) != due)
                throw new InvalidPluginExecutionException("Official due date must match the approved proposal.");
        }
        private static string Snapshot(Entity row)
        {
            var values = Fields.ToDictionary(p => p.Value, p => (object)(row.GetAttributeValue<string>(p.Key) ?? (p.Key == "pmdh_status" ? "Open" : "")));
            values["dueDate"] = row.GetAttributeValue<DateTime?>("pmdh_duedate")?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            values["responsiblePersonId"] = row.GetAttributeValue<EntityReference>("pmdh_responsibleperson")?.Id.ToString() ?? "";
            return new JavaScriptSerializer().Serialize(values);
        }
    }
}
