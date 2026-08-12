import { RequirePermission } from "../../components/guards/RequireRole";
import { ReferenceDataAdminPage } from "./ReferenceDataAdminPage";

export function ReferenceDataAdminRoute() {
  return (
    <RequirePermission permission="reference_data.manage">
      <ReferenceDataAdminPage />
    </RequirePermission>
  );
}
