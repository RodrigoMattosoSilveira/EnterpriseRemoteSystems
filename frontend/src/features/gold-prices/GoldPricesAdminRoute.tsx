import { RequirePermission } from "../../components/guards/RequireRole";
import { GoldPricesPage } from "./GoldPricesPage";

export function GoldPricesAdminRoute() {
  return (
    <RequirePermission permission="gold_prices.manage">
      <GoldPricesPage />
    </RequirePermission>
  );
}
