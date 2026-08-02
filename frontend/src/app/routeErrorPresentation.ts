export type RouteErrorPresentation = {
  title: string;
  message: string;
};

const accessDeniedMessage =
  "Your account does not have permission to access this page. Contact an administrator if you believe access is required.";

export function describeRouteError(error: unknown): RouteErrorPresentation {
  const status = readHttpStatus(error);

  if (status === 401) {
    return {
      title: "Authentication required",
      message: "Sign in with an authorized account to access this page.",
    };
  }

  if (status === 403) {
    return {
      title: "Access denied",
      message: accessDeniedMessage,
    };
  }

  if (status === 404) {
    return {
      title: "Page not found",
      message: "The requested page could not be found.",
    };
  }

  if (status !== undefined) {
    return {
      title: formatHttpStatusTitle(status, readStatusText(error)),
      message: "The request could not be completed.",
    };
  }

  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      message: error.message,
    };
  }

  return {
    title: "Something went wrong",
    message: "An unexpected error occurred.",
  };
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const status = Reflect.get(error, "status");
  if (typeof status === "number") return status;

  const code = Reflect.get(error, "code");
  if (code === "authentication_required") return 401;
  if (code === "forbidden" || code === "actor_inactive") return 403;
  if (code === "not_found") return 404;

  return undefined;
}

function readStatusText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const statusText = Reflect.get(error, "statusText");
  return typeof statusText === "string" ? statusText.trim() : "";
}

function formatHttpStatusTitle(status: number, statusText: string): string {
  return statusText ? `${status} ${statusText}` : `HTTP ${status}`;
}
