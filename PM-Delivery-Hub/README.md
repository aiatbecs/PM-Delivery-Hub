# PM Delivery Hub

PM Delivery Hub is an AI-assisted project-management workspace built around Microsoft 365. This repository starts the Dataverse solution source; it is not yet connected to a Power Platform environment and does not contain a deployed app, tables, flows, or AI agent.

## Initial architecture

- **Power Apps model-driven app** for project and delivery operations
- **Dataverse** as the structured system of record
- **SharePoint** for source documents and generated artifacts
- **Power Automate** for approvals and workflow orchestration
- **Copilot Studio** for the PM assistant and meeting intelligence
- **Teams and Outlook** as user entry points and communication tools
- **Power BI** for later portfolio reporting

The first end-to-end workflow and its acceptance criteria are in [docs/MVP.md](docs/MVP.md). The initial Dataverse table proposal is in [docs/DATA-MODEL.md](docs/DATA-MODEL.md).

## Repository layout

This project lives inside the parent `aiatbecs` Git repository; it does not use a separate nested repository.

```text
PM-Delivery-Hub/
  README.md
  docs/
    MVP.md
    DATA-MODEL.md
  PMDeliveryHub/
    PMDeliveryHub.cdsproj
    src/
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
pac auth create --url <dataverse-environment-url>
```

The solution source is intentionally empty beyond its generated manifest. Build and deployment steps should be added after the target environment, publisher, and solution lifecycle are confirmed.

## Delivery sequence

1. Confirm the development environment, access model, and source prompt library; retain the `pmdh` publisher prefix.
2. Implement the project records and model-driven app needed for the MVP.
3. Build the transcript-to-reviewed-records workflow described in [docs/MVP.md](docs/MVP.md).
4. Add other document generation and portfolio integrations only after that workflow is validated.
