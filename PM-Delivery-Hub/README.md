# PM Delivery Hub

PM Delivery Hub is an AI-assisted project-management workspace built around Microsoft 365. The development environment contains the `PMDeliveryHub` solution, a published Project app, and a **Meeting Review** workflow: import Copilot JSON with evidence, edit/approve/reject proposals, apply approved summaries and actions/risks/issues/dependencies, and prepare downloadable minutes/email drafts. Synchronous Dataverse plugins enforce approval and provenance for RAID records. Synthetic end-to-end tests have passed. Project-team access and integrated AI are not yet enabled; use synthetic data only. See [docs/MEETING-WORKFLOW.md](docs/MEETING-WORKFLOW.md) for usage and limits.

## Target architecture

- **Power Apps model-driven app** for project and delivery operations
- **Dataverse** as the structured system of record
- **SharePoint** for source documents and generated artifacts
- **Power Automate** for approvals and workflow orchestration
- **Copilot Studio** for the PM assistant and meeting intelligence
- **Teams and Outlook** as user entry points and communication tools
- **Power BI** for later portfolio reporting

The first end-to-end workflow and its acceptance criteria are in [docs/MVP.md](docs/MVP.md). The initial Dataverse table proposal is in [docs/DATA-MODEL.md](docs/DATA-MODEL.md).

The current increment uses model-driven app web resources, Dataverse transactions, and a signed sandbox plugin. The user runs extraction manually in their approved Microsoft 365 Copilot account. No paid AI API, Copilot Studio agent, Power Automate flow, SharePoint upload, or automatic email sending is configured.

## Repository layout

This project lives inside the parent `aiatbecs` Git repository; it does not use a separate nested repository.

```text
PM-Delivery-Hub/
  README.md
  docs/
    MVP.md
    DATA-MODEL.md
    MEETING-WORKFLOW.md
  PMDeliveryHub/
    PMDeliveryHub.cdsproj
    workflow/
      core.js
      core.test.cjs
      review.html
      review.js
      schema.mjs
      serve-deployment.mjs
      ApprovalGuard/
    src/
      Entities/
      AppModules/
      AppModuleSiteMaps/
      Other/
        Solution.xml
        Customizations.xml
        Relationships.xml
```

The solution was initialized with Power Platform CLI. Retain the publisher `PMDeliveryHub` and customization prefix `pmdh` for implementation.

## Prerequisites for implementation

1. A Microsoft Power Platform environment with Dataverse and permission to customize solutions.
2. A SharePoint site/library and access model for project documents.
3. Appropriate Power Apps, Power Automate, Copilot Studio, and Microsoft 365 licensing and tenant approvals for the features selected.
4. Power Platform CLI (`pac`) and the build tooling required for the generated `.cdsproj`.

No tenant URLs, credentials, customer data, or connection secrets belong in this repository. Tenant-specific connections and environment settings should be configured through approved environment variables or deployment settings, not committed.

## Local solution source

From the solution directory, authenticate to an approved development environment when ready:

```powershell
cd C:\aiatbecs\PM-Delivery-Hub\PMDeliveryHub
pac auth create --name PMDeliveryHub-Dev --environment <dataverse-environment-url>
```

The development work to date used the authenticated maker portal. Device-code CLI sign-in was blocked by tenant Conditional Access; do not disable or bypass that policy. Local packing and unpacking do not require tenant authentication.

## Milestone backup and restore

Version `1.0.0.3` includes the Meeting Review import fixes: 400-character evidence filenames, visible validation errors, and key-format guidance. It was exported as an unmanaged solution and unpacked with `pac solution unpack`. The earlier `1.0.0.2` ZIP preserves the initial Meeting Review milestone; `1.0.0.1` preserves the basic Project-only milestone. Repacking the source with `pac solution pack` succeeded. A restore into a separate environment has not yet been tested.

The `1.0.0.2` export SHA-256 is `7A25B9475083403B290B5E49A701B9C9D526B7C6359340F24493DAD1BA2BFCE7`.
The `1.0.0.3` export SHA-256 is `929728EBACF0B13DD288CFBD2D84032A9220AEE6053B87C20B739CD2A555DFB1`.

From the solution directory, create an unmanaged package in an existing output directory:

```powershell
pac solution pack --zipfile <output-zip-path> --folder .\src --packagetype Unmanaged
```

In an approved development environment, use **Solutions > Import solution** to import the package. The export declares dependencies on `msdyn_PowerAdminSettingsEmail (2.2.3580.1)`, `AppModuleWebResources (2.5)`, and `msdyn_AppFrameworkInfraExtensions (1.0.0.27)`. Check compatible dependencies and security-role mappings before importing. Do not use this unmanaged backup as the production release process.

Solution exports back up component definitions, not project rows, uploaded documents, user/team membership, or all environment settings. Autonumber seed values must be checked separately on restore. No Git remote is configured yet, so a local commit does not provide off-machine backup.

## Trying the development app

In the maker portal, select the approved development environment, open the `PMDeliveryHub` solution, and play the **PM Delivery Hub** model-driven app. Under **Delivery > Projects**, choose **New**, complete the required fields, and save. Project Number is generated automatically and is read-only on the main form.

Use synthetic data only until project access and data-handling requirements are implemented. The app has not been shared with additional users. The Active Projects view uses Dataverse's Active status; selecting Completed or Cancelled/Archived in the custom Stage column does not automatically deactivate a project.

For the new workflow, open **Delivery > Meeting Review**, select a project, and download or copy the extraction prompt. Process synthetic transcripts/screenshots in the approved Microsoft 365 Copilot account, paste its JSON back into the app, and review the proposals. Generic drafts also appear in a copyable preview if the browser blocks downloads. The app does not itself interpret screenshots or generate your corporate document templates.

## Workflow source validation

From the project directory:

```powershell
node --test .\PMDeliveryHub\workflow\core.test.cjs
node --check .\PMDeliveryHub\workflow\review.js
dotnet build .\PMDeliveryHub\workflow\ApprovalGuard\ApprovalGuard.csproj -c Release -p:PMDHSigningKey=<private-signing-key-path>
```

Keep the original signing key in approved private storage, outside Git. An imported solution contains the signed assembly, not its private signing key. Future assembly updates must retain the signing identity. The loopback deployment helper is a temporary local development utility, not a hosted application or an authentication workaround; stop it when deployment is finished.

## Delivery sequence

1. Confirm the development environment, access model, and source prompt library; retain the `pmdh` publisher prefix.
2. Implement the project records and model-driven app needed for the MVP.
3. Build the transcript-to-reviewed-records workflow described in [docs/MVP.md](docs/MVP.md).
4. Add other document generation and portfolio integrations only after that workflow is validated.
