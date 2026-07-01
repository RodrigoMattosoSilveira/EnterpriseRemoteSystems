import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { PeopleListPage } from "../features/people/PeopleListPage";
import { CreatePersonPage } from "../features/people/CreatePersonPage";
import { PersonDetailPage } from "../features/people/PersonDetailPage";
import { ReferenceDataAdminPage } from "../features/reference-data/ReferenceDataAdminPage";
import { CollaboratorsListPage } from "../features/collaborators/CollaboratorsListPage";
import { CreateCollaboratorPage } from "../features/collaborators/CreateCollaboratorPage";
import { CollaboratorDetailPage } from "../features/collaborators/CollaboratorDetailPage";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { CreateExpensePage } from "../features/expenses/CreateExpensePage";
import { ExpenseDetailPage } from "../features/expenses/ExpenseDetailPage";
import { WorkPeriodsPage } from "../features/planning/WorkPeriodsPage";
import { WorkPeriodDetailPage } from "../features/planning/WorkPeriodDetailPage";
import { PrintableReceiptPage } from "../features/receipts/PrintableReceiptPage";
import { OutstandingReceiptsPage } from "../features/receipts/OutstandingReceiptsPage";
import { AuthzAdminPage } from "../features/authz/AuthzAdminPage";
import { AuditLogViewerPage } from "../features/authz/AuditLogViewerPage";
import { CollaboratorCurrentAccountPage } from "../features/current-accounts/CollaboratorCurrentAccountPage";
import { SecondPersonApprovalSettingsPage } from "../features/current-accounts/SecondPersonApprovalSettingsPage";
import { GoldPricesPage } from "../features/gold-prices/GoldPricesPage";
import { PriceListPage } from "../features/price-list/PriceListPage";
import { MineProductionPage } from "../features/production/MineProductionPage";

function RouteErrorPage() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = "The requested page could not be found.";
  } else if (error instanceof Error) {
    message = error.message;
  }

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

function NotFoundPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Page not found</h1>
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
      { index: true, element: <PeopleListPage /> },
      { path: "people", element: <PeopleListPage /> },
      { path: "people/new", element: <CreatePersonPage /> },
      { path: "people/:id", element: <PersonDetailPage /> },
      { path: "collaborators", element: <CollaboratorsListPage /> },
      { path: "collaborators/new", element: <CreateCollaboratorPage /> },
      { path: "collaborators/:id", element: <CollaboratorDetailPage /> },
      { path: "collaborators/:id/current-account", element: <CollaboratorCurrentAccountPage /> },
      { path: "expenses", element: <ExpensesPage /> },
      { path: "expenses/new", element: <CreateExpensePage /> },
      { path: "expenses/:id", element: <ExpenseDetailPage /> },
      { path: "work-periods", element: <WorkPeriodsPage /> },
      { path: "work-periods/:id", element: <WorkPeriodDetailPage /> },
      { path: "gold-production", element: <MineProductionPage /> },
      { path: "ledger-entries/:entryId/receipt", element: <PrintableReceiptPage /> },
      { path: "receipts/outstanding", element: <OutstandingReceiptsPage /> },
      { path: "admin/reference-data", element: <ReferenceDataAdminPage /> },
      { path: "admin/authorization", element: <AuthzAdminPage /> },
      { path: "admin/audit-logs", element: <AuditLogViewerPage /> },
      { path: "admin/current-account-settings", element: <SecondPersonApprovalSettingsPage /> },
      { path: "admin/gold-prices", element: <GoldPricesPage /> },
      { path: "admin/price-list-items", element: <PriceListPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
