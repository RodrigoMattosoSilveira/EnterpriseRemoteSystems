import { RequireAnyPermission } from "../../components/guards/RequireRole";
import { ReferenceDataAdminPage } from "./ReferenceDataAdminPage";

export function ReferenceDataAdminRoute() {
  return (
    <RequireAnyPermission permissions={["reference_data.read", "reference_data.manage"]}>
      <ReferenceDataAdminPage />
    </RequireAnyPermission>
  );
}
