import type { ComponentProps } from "react";
import { Link } from "react-router-dom";
import { useOptionalAuthorizationContext } from "./AuthorizationContext";
import { canNavigateToPath } from "./navigation";

type PermissionGatedLinkProps = ComponentProps<typeof Link>;

// Renders a hard-coded navigation link only when the current actor's effective
// permissions expose the same destination in the side menu. Hidden links render
// nothing, so narrow logins such as collaborator self-service never see them.
export function PermissionGatedLink(props: PermissionGatedLinkProps) {
  const actor = useOptionalAuthorizationContext();
  if (!actor || typeof props.to !== "string") return null;
  const permitted = canNavigateToPath(actor.permissions, actor.scope, props.to, {
    personId: actor.personId,
    collaboratorId: actor.collaboratorId,
    supportLeaseId: actor.supportLeaseId,
  });
  if (!permitted) return null;
  return <Link {...props} />;
}
