import { createBrowserRouter, Link, Navigate, useRouteError, type RouteObject } from "react-router-dom";
import { RequireAuth } from "../components/guards/RequireAuth";
import { RequirePermission } from "../components/guards/RequireRole";
import { AppShell } from "../components/layout/AppShell";
import { useAuthorizationContext } from "../components/layout/AuthorizationContext";
import { defaultAuthorizedRoute } from "../components/layout/navigation";
import LoginPage from "../features/auth/LoginPage";
import { ChangePasswordPage } from "../features/auth/ChangePasswordPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { AuthenticationAdminPage } from "../features/auth/AuthenticationAdminPage";
import { AuthenticationLookupDismissBoundary } from "../features/auth/AuthenticationLookupDismissBoundary";
import { describeRouteError } from "./routeErrorPresentation";

function RouteErrorPage() {
  const presentation = describeRouteError(useRouteError());
  return <StatusPage title={presentation.title} message={presentation.message} />;
}
function NotFoundPage() { return <StatusPage title="Page not found" message="The requested page could not be found." />; }
function PermissionAwareHome() {
  const actor = useAuthorizationContext();
  return <Navigate to={defaultAuthorizedRoute(actor.permissions, actor.scope, { personId: actor.personId, collaboratorId: actor.collaboratorId })} replace />;
}
export function ForbiddenPage() { return <StatusPage title="Access forbidden" message="Your current role does not permit this operation in the selected tenant." />; }
function StatusPage({ title, message }: { title: string; message: string }) {
  return <main className="p-6"><section className="mx-auto max-w-xl rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-slate-600">{message}</p><Link className="mt-4 inline-block underline" to="/">Return to ERS</Link></section></main>;
}

const protectedChildren: RouteObject[] = [
  { index: true, element: <PermissionAwareHome /> },
  { path: "people", lazy: async () => ({ Component: (await import("../features/people/PeopleListPage")).PeopleListPage }) },
  { path: "people/new", lazy: async () => ({ Component: (await import("../features/people/CreatePersonPage")).CreatePersonPage }) },
  { path: "people/add-existing", lazy: async () => ({ Component: (await import("../features/people/AddPersonMembershipPage")).AddPersonMembershipPage }) },
  { path: "people/:id", lazy: async () => ({ Component: (await import("../features/people/PersonDetailPage")).PersonDetailPage }) },
  { path: "collaborators", lazy: async () => ({ Component: (await import("../features/collaborators/CollaboratorsListPage")).CollaboratorsListPage }) },
  { path: "collaborators/new", lazy: async () => ({ Component: (await import("../features/collaborators/CreateCollaboratorPage")).CreateCollaboratorPage }) },
  { path: "collaborators/:id", lazy: async () => ({ Component: (await import("../features/collaborators/CollaboratorDetailPage")).CollaboratorDetailPage }) },
  { path: "collaborators/:id/current-account", lazy: async () => ({ Component: (await import("../features/current-accounts/CollaboratorCurrentAccountPage")).CollaboratorCurrentAccountPage }) },
  { path: "expenses", lazy: async () => ({ Component: (await import("../features/expenses/ExpensesPage")).ExpensesPage }) },
  { path: "expenses/new", lazy: async () => ({ Component: (await import("../features/expenses/CreateExpensePage")).CreateExpensePage }) },
  { path: "expenses/:id", lazy: async () => ({ Component: (await import("../features/expenses/ExpenseDetailPage")).ExpenseDetailPage }) },
  { path: "work-periods", lazy: async () => ({ Component: (await import("../features/planning/WorkPeriodsPage")).WorkPeriodsPage }) },
  { path: "work-periods/:id", lazy: async () => ({ Component: (await import("../features/planning/WorkPeriodDetailPage")).WorkPeriodDetailPage }) },
  { path: "gold-production", lazy: async () => ({ Component: (await import("../features/production/MineProductionPage")).MineProductionPage }) },
  { path: "ledger-entries/:entryId/receipt", lazy: async () => ({ Component: (await import("../features/receipts/PrintableReceiptPage")).PrintableReceiptPage }) },
  { path: "receipts/outstanding", lazy: async () => ({ Component: (await import("../features/receipts/OutstandingReceiptsPage")).OutstandingReceiptsPage }) },
  { path: "admin/tenants", lazy: async () => ({ Component: (await import("../features/tenants/TenantsAdminPage")).TenantsAdminPage }) },
  { path: "admin/tenants/:id", lazy: async () => ({ Component: (await import("../features/tenants/TenantDetailPage")).TenantDetailPage }) },
  { path: "admin/reference-data", lazy: async () => ({ Component: (await import("../features/reference-data/ReferenceDataAdminRoute")).ReferenceDataAdminRoute }) },
  { path: "admin/authentication", element: <RequirePermission permission="authz.manage" applicationOnly><AuthenticationLookupDismissBoundary><AuthenticationAdminPage /></AuthenticationLookupDismissBoundary></RequirePermission> },
  { path: "admin/authorization", lazy: async () => ({ Component: (await import("../features/authz/AuthzAdminRoute")).AuthzAdminRoute }) },
  { path: "admin/audit-logs", lazy: async () => ({ Component: (await import("../features/authz/AuditLogViewerPage")).AuditLogViewerPage }) },
  { path: "admin/current-account-settings", lazy: async () => ({ Component: (await import("../features/current-accounts/SecondPersonApprovalSettingsPage")).SecondPersonApprovalSettingsPage }) },
  { path: "admin/gold-prices", lazy: async () => ({ Component: (await import("../features/gold-prices/GoldPricesAdminRoute")).GoldPricesAdminRoute }) },
  { path: "admin/price-list-items", lazy: async () => ({ Component: (await import("../features/price-list/PriceListPage")).PriceListPage }) },
  { path: "forbidden", element: <ForbiddenPage /> },
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/password/reset", element: <ResetPasswordPage /> },
  { path: "/password/change", element: <RequireAuth><ChangePasswordPage /></RequireAuth> },
  { path: "/", errorElement: <RouteErrorPage />, element: <RequireAuth><AppShell /></RequireAuth>, children: protectedChildren },
]);
