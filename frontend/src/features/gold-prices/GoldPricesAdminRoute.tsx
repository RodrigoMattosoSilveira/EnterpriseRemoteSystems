import { RequireAnyPermission } from "../../components/guards/RequireRole";
import { GoldPricesPage } from "./GoldPricesPage";

export function GoldPricesAdminRoute() {
  return (
    <RequireAnyPermission permissions={["gold_prices.read", "gold_prices.manage"]}>
      <GoldPricesPage />
    </RequireAnyPermission>
  );
}
