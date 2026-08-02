import { createBrowserRouter, Link, useRouteError } from "react-router-dom";
import { describeRouteError } from "./routeErrorPresentation";

function RouteErrorPage() {
  const presentation = describeRouteError(useRouteError());

  return (
    <StatusPage
      title={presentation.title}
      message={presentation.message}
    />
  );
}

function NotFoundPage() {
  return (
    <StatusPage
      title="Page not found"
      message="The requested page could not be found."
    />
  );
}

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-gray-600">{message}</p>
      <Link className="mt-4 inline-block underline" to="/people">
        Go to People
      </Link>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { PeopleListPage } = await import("../features/people/PeopleListPage");
          return { Component: PeopleListPage };
        },
      },
      {
        path: "people",
        lazy: async () => {
          const { PeopleListPage } = await import("../features/people/PeopleListPage");
          return { Component: PeopleListPage };
        },
      },
      {
        path: "people/new",
        lazy: async () => {
          const { CreatePersonPage } = await import("../features/people/CreatePersonPage");
          return { Component: CreatePersonPage };
        },
      },
      {
        path: "people/:id",
        lazy: async () => {
          const { PersonDetailPage } = await import("../features/people/PersonDetailPage");
          return { Component: PersonDetailPage };
        },
      },
      {
        path: "collaborators",
        lazy: async () => {
          const { CollaboratorsListPage } = await import("../features/collaborators/CollaboratorsListPage");
          return { Component: CollaboratorsListPage };
        },
      },
      {
        path: "collaborators/new",
        lazy: async () => {
          const { CreateCollaboratorPage } = await import("../features/collaborators/CreateCollaboratorPage");
          return { Component: CreateCollaboratorPage };
        },
      },
      {
        path: "collaborators/:id",
        lazy: async () => {
          const { CollaboratorDetailPage } = await import("../features/collaborators/CollaboratorDetailPage");
          return { Component: CollaboratorDetailPage };
        },
      },
      {
        path: "collaborators/:id/current-account",
        lazy: async () => {
          const { CollaboratorCurrentAccountPage } = await import("../features/current-accounts/CollaboratorCurrentAccountPage");
          return { Component: CollaboratorCurrentAccountPage };
        },
      },
      {
        path: "expenses",
        lazy: async () => {
          const { ExpensesPage } = await import("../features/expenses/ExpensesPage");
          return { Component: ExpensesPage };
        },
      },
      {
        path: "expenses/new",
        lazy: async () => {
          const { CreateExpensePage } = await import("../features/expenses/CreateExpensePage");
          return { Component: CreateExpensePage };
        },
      },
      {
        path: "expenses/:id",
        lazy: async () => {
          const { ExpenseDetailPage } = await import("../features/expenses/ExpenseDetailPage");
          return { Component: ExpenseDetailPage };
        },
      },
      {
        path: "work-periods",
        lazy: async () => {
          const { WorkPeriodsPage } = await import("../features/planning/WorkPeriodsPage");
          return { Component: WorkPeriodsPage };
        },
      },
      {
        path: "work-periods/:id",
        lazy: async () => {
          const { WorkPeriodDetailPage } = await import("../features/planning/WorkPeriodDetailPage");
          return { Component: WorkPeriodDetailPage };
        },
      },
      {
        path: "gold-production",
        lazy: async () => {
          const { MineProductionPage } = await import("../features/production/MineProductionPage");
          return { Component: MineProductionPage };
        },
      },
      {
        path: "ledger-entries/:entryId/receipt",
        lazy: async () => {
          const { PrintableReceiptPage } = await import("../features/receipts/PrintableReceiptPage");
          return { Component: PrintableReceiptPage };
        },
      },
      {
        path: "receipts/outstanding",
        lazy: async () => {
          const { OutstandingReceiptsPage } = await import("../features/receipts/OutstandingReceiptsPage");
          return { Component: OutstandingReceiptsPage };
        },
      },
      {
        path: "admin/tenants",
        lazy: async () => {
          const { TenantsAdminPage } = await import("../features/tenants/TenantsAdminPage");
          return { Component: TenantsAdminPage };
        },
      },
      {
        path: "admin/tenants/:id",
        lazy: async () => {
          const { TenantDetailPage } = await import("../features/tenants/TenantDetailPage");
          return { Component: TenantDetailPage };
        },
      },
      {
        path: "admin/reference-data",
        lazy: async () => {
          const { ReferenceDataAdminPage } = await import("../features/reference-data/ReferenceDataAdminPage");
          return { Component: ReferenceDataAdminPage };
        },
      },
      {
        path: "admin/authorization",
        lazy: async () => {
          const { AuthzAdminRoute } = await import("../features/authz/AuthzAdminRoute");
          return { Component: AuthzAdminRoute };
        },
      },
      {
        path: "admin/audit-logs",
        lazy: async () => {
          const { AuditLogViewerPage } = await import("../features/authz/AuditLogViewerPage");
          return { Component: AuditLogViewerPage };
        },
      },
      {
        path: "admin/current-account-settings",
        lazy: async () => {
          const { SecondPersonApprovalSettingsPage } = await import("../features/current-accounts/SecondPersonApprovalSettingsPage");
          return { Component: SecondPersonApprovalSettingsPage };
        },
      },
      {
        path: "admin/gold-prices",
        lazy: async () => {
          const { GoldPricesPage } = await import("../features/gold-prices/GoldPricesPage");
          return { Component: GoldPricesPage };
        },
      },
      {
        path: "admin/price-list-items",
        lazy: async () => {
          const { PriceListPage } = await import("../features/price-list/PriceListPage");
          return { Component: PriceListPage };
        },
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
