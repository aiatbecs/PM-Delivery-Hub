using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PMDeliveryHub
{
    public sealed class DeliveryGuard : IPlugin
    {
        public const string MemberRole = "PMDH Project Member";
        public const string ManagementRole = "PMDH Management";

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            var admin = factory.CreateOrganizationService(null);
            var name = context.PrimaryEntityName;
            if (context.MessageName == "Assign")
            {
                if (name == "pmdh_person")
                    throw new InvalidPluginExecutionException("Directory ownership changes are not supported.");
                var assigned = (EntityReference)context.InputParameters["Target"];
                var row = admin.Retrieve(name, assigned.Id, new ColumnSet(name == "pmdh_project" ? "pmdh_deliveryteam" : "pmdh_project"));
                var assignedProject = name == "pmdh_project" ? row : admin.Retrieve("pmdh_project",
                    row.GetAttributeValue<EntityReference>("pmdh_project").Id, new ColumnSet("pmdh_deliveryteam"));
                if (!IsManager(admin, context.InitiatingUserId) ||
                    assignedProject.GetAttributeValue<EntityReference>("pmdh_deliveryteam")?.Id != ((EntityReference)context.InputParameters["Assignee"]).Id)
                    throw new InvalidPluginExecutionException("Delivery ownership is server-managed; use project membership to grant access.");
                return;
            }
            var target = context.InputParameters["Target"];
            var id = target is Entity entity ? entity.Id : ((EntityReference)target).Id;
            var before = context.PreEntityImages.Contains("Before") ? context.PreEntityImages["Before"] : null;
            var managed = name == "pmdh_person" || name == "pmdh_projectmember" || name == "pmdh_project";
            if (managed && (name != "pmdh_project" || context.MessageName != "Update") &&
                !IsManager(admin, context.InitiatingUserId))
                throw new InvalidPluginExecutionException("Only designated PMDH management may manage people, membership or projects.");
            if (context.Stage == 40)
            {
                if (name == "pmdh_project") CreateTeam(admin, service, id);
                else if (name == "pmdh_projectmember")
                {
                    var row = context.MessageName == "Delete" ? before : service.Retrieve(name, id, new ColumnSet(true));
                    SyncMember(admin, row, context.MessageName != "Delete");
                }
                else if (name == "pmdh_person")
                {
                    var row = service.Retrieve(name, id, new ColumnSet("pmdh_user"));
                    var memberships = new QueryExpression("pmdh_projectmember") { ColumnSet = new ColumnSet(true) };
                    memberships.Criteria.AddCondition("pmdh_person", ConditionOperator.Equal, id);
                    foreach (var membership in admin.RetrieveMultiple(memberships).Entities)
                    {
                        if (before?.GetAttributeValue<EntityReference>("pmdh_user") != null)
                            SyncMember(admin, membership, false, before.GetAttributeValue<EntityReference>("pmdh_user"));
                        SyncMember(admin, membership, true, row.GetAttributeValue<EntityReference>("pmdh_user"));
                    }
                }
                return;
            }
            if (context.MessageName == "Delete")
            {
                if (name != "pmdh_projectmember" && name != "pmdh_person")
                    throw new InvalidPluginExecutionException("Delivery records cannot be deleted; close them to preserve provenance and history.");
                return;
            }
            var changes = (Entity)target;
            var current = context.MessageName == "Update" ? service.Retrieve(name, id, new ColumnSet(true)) : new Entity(name, id);
            var combined = new Entity(name, id);
            foreach (var pair in current.Attributes) combined[pair.Key] = pair.Value;
            foreach (var pair in changes.Attributes) combined[pair.Key] = pair.Value;
            if (name == "pmdh_person")
            {
                if (string.IsNullOrWhiteSpace(combined.GetAttributeValue<string>("pmdh_name")) ||
                    string.IsNullOrWhiteSpace(combined.GetAttributeValue<string>("pmdh_directorykey")))
                    throw new InvalidPluginExecutionException("Person name and stable directory key are required.");
                if (current.Contains("pmdh_directorykey") && changes.Contains("pmdh_directorykey") &&
                    current.GetAttributeValue<string>("pmdh_directorykey") != changes.GetAttributeValue<string>("pmdh_directorykey"))
                    throw new InvalidPluginExecutionException("Directory key cannot change.");
                var user = combined.GetAttributeValue<EntityReference>("pmdh_user");
                if (user != null)
                {
                    var account = admin.Retrieve("systemuser", user.Id, new ColumnSet("isdisabled", "applicationid"));
                    if (account.GetAttributeValue<bool>("isdisabled") || account.GetAttributeValue<Guid>("applicationid") != Guid.Empty)
                        throw new InvalidPluginExecutionException("A person must link to an active human user.");
                }
                if (changes.Contains("statecode") && changes.GetAttributeValue<OptionSetValue>("statecode").Value != 0)
                    throw new InvalidPluginExecutionException("Remove project memberships before retiring a directory person; deactivation is not supported here.");
                return;
            }
            if (name == "pmdh_project")
            {
                if (context.Depth == 1 && (changes.Contains("pmdh_deliveryteam") ||
                    context.MessageName == "Update" && changes.Contains("ownerid")))
                    throw new InvalidPluginExecutionException("Project security team is server-managed.");
                return;
            }
            var project = combined.GetAttributeValue<EntityReference>("pmdh_project");
            if (project == null) throw new InvalidPluginExecutionException("Project is required.");
            var team = service.Retrieve("pmdh_project", project.Id, new ColumnSet("pmdh_deliveryteam"))
                .GetAttributeValue<EntityReference>("pmdh_deliveryteam");
            if (team == null) throw new InvalidPluginExecutionException("Project access team has not been provisioned.");
            if (context.MessageName == "Update" && changes.Contains("ownerid") && changes.GetAttributeValue<EntityReference>("ownerid")?.Id != team.Id)
                throw new InvalidPluginExecutionException("Delivery record must remain owned by its project team.");
            if (context.MessageName == "Create") changes["ownerid"] = team;
            if (name == "pmdh_projectmember")
            {
                if (combined.GetAttributeValue<EntityReference>("pmdh_person") == null)
                    throw new InvalidPluginExecutionException("Project member requires a directory person.");
                if (context.MessageName == "Update" && (changes.Contains("pmdh_project") || changes.Contains("pmdh_person")))
                    throw new InvalidPluginExecutionException("Remove and recreate membership to change project or person.");
                if (string.IsNullOrWhiteSpace(combined.GetAttributeValue<string>("pmdh_role")))
                    throw new InvalidPluginExecutionException("Project role is required.");
                if (changes.Contains("statecode") && changes.GetAttributeValue<OptionSetValue>("statecode").Value != 0)
                    throw new InvalidPluginExecutionException("Remove membership to revoke access.");
                return;
            }
            var person = combined.GetAttributeValue<EntityReference>("pmdh_responsibleperson");
            if (person != null)
            {
                var membership = new QueryExpression("pmdh_projectmember") { ColumnSet = new ColumnSet(false), TopCount = 1 };
                membership.Criteria.AddCondition("pmdh_project", ConditionOperator.Equal, project.Id);
                membership.Criteria.AddCondition("pmdh_person", ConditionOperator.Equal, person.Id);
                if (service.RetrieveMultiple(membership).Entities.Count != 1)
                    throw new InvalidPluginExecutionException("Responsible person must be a member of this project.");
            }
        }

        public static bool IsManager(IOrganizationService service, Guid user)
        {
            var query = new QueryExpression("role") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("name", ConditionOperator.Equal, ManagementRole);
            var link = query.AddLink("systemuserroles", "roleid", "roleid");
            link.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, user);
            return service.RetrieveMultiple(query).Entities.Count == 1;
        }

        private static void CreateTeam(IOrganizationService admin, IOrganizationService service, Guid projectId)
        {
            var project = service.Retrieve("pmdh_project", projectId, new ColumnSet("pmdh_projectname", "pmdh_deliveryteam"));
            if (project.Contains("pmdh_deliveryteam")) return;
            var roles = new QueryExpression("role") { ColumnSet = new ColumnSet("businessunitid") };
            roles.Criteria.AddCondition("name", ConditionOperator.Equal, MemberRole);
            roles.Criteria.AddCondition("parentroleid", ConditionOperator.Null);
            var matches = admin.RetrieveMultiple(roles).Entities;
            if (matches.Count != 1) throw new InvalidPluginExecutionException("Configure exactly one root PMDH Project Member security role.");
            var role = matches[0];
            var team = new Entity("team") {
                ["name"] = "PMDH " + projectId, ["teamtype"] = new OptionSetValue(0),
                ["businessunitid"] = role.GetAttributeValue<EntityReference>("businessunitid")
            };
            team.Id = admin.Create(team);
            admin.Associate("team", team.Id, new Relationship("teamroles_association"),
                new EntityReferenceCollection { role.ToEntityReference() });
            admin.Update(new Entity("pmdh_project", projectId) {
                ["pmdh_deliveryteam"] = team.ToEntityReference(), ["ownerid"] = team.ToEntityReference()
            });
        }

        private static void SyncMember(IOrganizationService admin, Entity membership, bool add, EntityReference account = null)
        {
            if (membership == null) throw new InvalidPluginExecutionException("Membership pre-image missing.");
            var person = membership.GetAttributeValue<EntityReference>("pmdh_person");
            var user = account ?? admin.Retrieve("pmdh_person", person.Id, new ColumnSet("pmdh_user"))
                .GetAttributeValue<EntityReference>("pmdh_user");
            if (user == null) return;
            var project = membership.GetAttributeValue<EntityReference>("pmdh_project");
            var team = admin.Retrieve("pmdh_project", project.Id, new ColumnSet("pmdh_deliveryteam"))
                .GetAttributeValue<EntityReference>("pmdh_deliveryteam");
            if (team == null) throw new InvalidPluginExecutionException("Project team missing.");
            if (add) admin.Execute(new AddMembersTeamRequest { TeamId = team.Id, MemberIds = new[] { user.Id } });
            else admin.Execute(new RemoveMembersTeamRequest { TeamId = team.Id, MemberIds = new[] { user.Id } });
        }
    }
}
