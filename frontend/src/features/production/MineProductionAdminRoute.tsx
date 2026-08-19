import { RequirePermission } from "../../components/guards/RequireRole";
import { MineProductionPage } from "./MineProductionPage";

export function MineProductionAdminRoute() {
  return (
    <RequirePermission permission="gold_production.manage">
      <MineProductionPage />
    </RequirePermission>
  );
}
