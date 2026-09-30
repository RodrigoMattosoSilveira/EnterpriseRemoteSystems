import { RequireAnyPermission } from "../../components/guards/RequireRole";
import { MineProductionPage } from "./MineProductionPage";

export function MineProductionAdminRoute() {
  return (
    <RequireAnyPermission permissions={["gold_production.read", "gold_production.manage"]}>
      <MineProductionPage />
    </RequireAnyPermission>
  );
}
