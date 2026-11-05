using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace PMDeliveryHub
{
    public sealed class ApprovalGuard : IPlugin
    {
        private const int Pending = 425070000;
        private static readonly string[] Kinds = { "Summary", "Action", "Risk", "Issue", "Dependency" };

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                throw new InvalidPluginExecutionException("PM Delivery Hub guard requires an entity target.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            trace.Trace("PMDH guard: {0} {1}", context.MessageName, target.LogicalName);
            var current = context.MessageName == "Update"
                ? service.Retrieve(target.LogicalName, target.Id, new Microsoft.Xrm.Sdk.Query.ColumnSet(true))
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
                foreach (var field in new[] { "pmdh_sourcename", "pmdh_locator", "pmdh_excerpt" })
                    RequiredText(combined, field);
                if (context.MessageName == "Update") Immutable(target, current, "pmdh_project", "pmdh_meeting", "pmdh_sourcename", "pmdh_locator", "pmdh_excerpt");
                return;
            }
            var evidence = Reference(combined, "pmdh_evidence", "pmdh_evidence");
            var source = service.Retrieve("pmdh_evidence", evidence.Id,
                new Microsoft.Xrm.Sdk.Query.ColumnSet("pmdh_project", "pmdh_meeting"));
            if (Reference(source, "pmdh_project", "pmdh_project").Id != project.Id ||
                Reference(source, "pmdh_meeting", "pmdh_meeting").Id != meeting.Id)
                throw new InvalidPluginExecutionException("Evidence must belong to the selected project and meeting.");

            if (target.LogicalName == "pmdh_proposal")
            {
                RequiredKey(combined, "pmdh_candidatekey");
                var proposalKind = combined.GetAttributeValue<OptionSetValue>("pmdh_kind")?.Value;
                if (!proposalKind.HasValue || proposalKind < Pending || proposalKind > Pending + 4)
                    throw new InvalidPluginExecutionException("A supported proposal type is required.");
                var state = combined.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value ?? Pending;
                if (context.MessageName == "Create" && state != Pending)
                    throw new InvalidPluginExecutionException("New proposals must be Pending.");
                if (context.MessageName == "Update")
                {
                    Immutable(target, current, "pmdh_project", "pmdh_meeting", "pmdh_evidence", "pmdh_candidatekey", "pmdh_kind");
                    if ((current.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value ?? Pending) != Pending)
                        throw new InvalidPluginExecutionException("Reviewed proposals are immutable. Submit a new candidate for changes.");
                }
                ValidatePayload(combined);
                if (state < Pending || state > Pending + 3)
                    throw new InvalidPluginExecutionException("Invalid proposal review status.");
                if (state == Pending)
                {
                    target["pmdh_reviewstatus"] = new OptionSetValue(Pending);
                    if (!string.IsNullOrEmpty(combined.GetAttributeValue<string>("pmdh_appliedid")))
                        throw new InvalidPluginExecutionException("Pending proposals cannot reference applied records.");
                    target["pmdh_reviewedby"] = null;
                    target["pmdh_reviewedon"] = null;
                }
                else
                {
                    var user = service.Retrieve("systemuser", context.InitiatingUserId,
                        new Microsoft.Xrm.Sdk.Query.ColumnSet("applicationid", "isdisabled"));
                    if (user.GetAttributeValue<Guid>("applicationid") != Guid.Empty || user.GetAttributeValue<bool>("isdisabled"))
                        throw new InvalidPluginExecutionException("Review requires an active human user.");
                    target["pmdh_reviewedby"] = new EntityReference("systemuser", context.InitiatingUserId);
                    target["pmdh_reviewedon"] = DateTime.UtcNow;
                    if (state == Pending + 3 && !string.IsNullOrEmpty(combined.GetAttributeValue<string>("pmdh_appliedid")))
                        throw new InvalidPluginExecutionException("Rejected proposals cannot be applied.");
                    if (state == Pending + 1 || state == Pending + 2)
                    {
                        if (!Guid.TryParse(combined.GetAttributeValue<string>("pmdh_appliedid"), out var applied) || applied != target.Id)
                            throw new InvalidPluginExecutionException("Applied ID must be the approved proposal ID.");
                    }
                }
                return;
            }

            var proposalRef = Reference(combined, "pmdh_proposal", "pmdh_proposal");
            var proposal = service.Retrieve("pmdh_proposal", proposalRef.Id,
                new Microsoft.Xrm.Sdk.Query.ColumnSet("pmdh_project", "pmdh_meeting", "pmdh_evidence", "pmdh_kind", "pmdh_reviewstatus", "pmdh_payload"));
            var review = proposal.GetAttributeValue<OptionSetValue>("pmdh_reviewstatus")?.Value;
            var kind = proposal.GetAttributeValue<OptionSetValue>("pmdh_kind")?.Value - Pending;
            if (review != Pending + 1 && review != Pending + 2)
                throw new InvalidPluginExecutionException("Only human-approved proposals may create official RAID records.");
            if (!kind.HasValue || kind < 1 || kind > 4 || target.LogicalName != "pmdh_" + Kinds[kind.Value].ToLowerInvariant())
                throw new InvalidPluginExecutionException("Record type must match its approved proposal.");
            foreach (var key in new[] { "pmdh_project", "pmdh_meeting", "pmdh_evidence" })
                if (combined.GetAttributeValue<EntityReference>(key).Id != proposal.GetAttributeValue<EntityReference>(key).Id)
                    throw new InvalidPluginExecutionException("Record provenance must match its approved proposal.");
            if (context.MessageName == "Create")
            {
                if (target.Id != proposalRef.Id)
                    throw new InvalidPluginExecutionException("Official record ID must equal proposal ID to prevent duplicate application.");
                var data = ValidatePayload(proposal);
                foreach (var pair in new Dictionary<string, string> {
                    { "pmdh_name", "title" }, { "pmdh_description", "description" }, { "pmdh_responsibleparty", "responsibleParty" },
                    { "pmdh_impact", "impact" }, { "pmdh_response", "response" }, { "pmdh_probability", "probability" }
                })
                    if ((combined.GetAttributeValue<string>(pair.Key) ?? "") != Read(data, pair.Value))
                        throw new InvalidPluginExecutionException("Official content must match the approved proposal: " + pair.Key);
                var due = Read(data, "dueDate");
                var actualDue = combined.GetAttributeValue<DateTime?>("pmdh_duedate");
                if (due.Length == 0 ? actualDue.HasValue : !actualDue.HasValue ||
                    actualDue.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) != due)
                    throw new InvalidPluginExecutionException("Official due date must match the approved proposal.");
            }
            else Immutable(target, current, "pmdh_project", "pmdh_meeting", "pmdh_evidence", "pmdh_proposal");
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
            var row = service.Retrieve(record.LogicalName, record.Id, new Microsoft.Xrm.Sdk.Query.ColumnSet("pmdh_project"));
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
                var equal = before is EntityReference b && after is EntityReference a
                    ? b.Id == a.Id && b.LogicalName == a.LogicalName : Equals(before, after);
                if (!equal) throw new InvalidPluginExecutionException("Source field cannot change: " + field);
            }
        }

        private static string Read(Dictionary<string, object> data, string key)
        {
            if (!data.TryGetValue(key, out var value) || value == null) return "";
            if (!(value is string text)) throw new InvalidPluginExecutionException("Proposal fields must be text: " + key);
            return text;
        }

        private static Dictionary<string, object> ValidatePayload(Entity proposal)
        {
            Dictionary<string, object> data;
            try { data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(proposal.GetAttributeValue<string>("pmdh_payload") ?? ""); }
            catch (ArgumentException) { throw new InvalidPluginExecutionException("Proposal payload must be valid JSON."); }
            var allowed = new[] { "title", "description", "responsibleParty", "dueDate", "impact", "response", "probability" };
            if (data == null || data.Keys.Any(k => !allowed.Contains(k)) || string.IsNullOrWhiteSpace(Read(data, "title")) ||
                string.IsNullOrWhiteSpace(Read(data, "description")))
                throw new InvalidPluginExecutionException("Invalid proposal payload fields.");
            foreach (var pair in new Dictionary<string, int> {
                { "title", 200 }, { "description", 10000 }, { "responsibleParty", 200 },
                { "impact", 4000 }, { "response", 4000 }, { "probability", 100 }, { "dueDate", 10 }
            })
                if (Read(data, pair.Key).Length > pair.Value)
                    throw new InvalidPluginExecutionException("Proposal field exceeds maximum length: " + pair.Key);
            var due = Read(data, "dueDate");
            if (due.Length != 0 && !DateTime.TryParseExact(due, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out _))
                throw new InvalidPluginExecutionException("Proposal dueDate must be a real YYYY-MM-DD date.");
            return data;
        }
    }
}
