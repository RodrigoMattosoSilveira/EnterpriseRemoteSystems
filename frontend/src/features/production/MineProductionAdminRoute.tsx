import { RequireAnyPermission } from "../../components/guards/RequireRole";
import { MineProductionPage } from "./MineProductionPage";

export function MineProductionAdminRoute() {
  return (
    <RequireAnyPermission permissions={["earnings.read", "gold_production.manage"]}>
      <MineProductionPage />
    </RequireAnyPermission>
  );
}
