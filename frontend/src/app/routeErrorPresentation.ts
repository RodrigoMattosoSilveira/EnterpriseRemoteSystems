import { translateEnglish, type Translate } from "../i18n";

export type RouteErrorPresentation = {
  title: string;
  message: string;
};

export function describeRouteError(error: unknown, t: Translate = translateEnglish): RouteErrorPresentation {
  const status = readHttpStatus(error);

  if (status === 401) {
    return {
      title: t("route.authenticationRequired.title"),
      message: t("route.authenticationRequired.message"),
    };
  }

  if (status === 403) {
    return {
      title: t("route.accessDenied.title"),
      message: t("route.accessDenied.message"),
    };
  }

  if (status === 404) {
    return {
      title: t("route.pageNotFound.title"),
      message: t("route.pageNotFound.message"),
    };
  }

  if (status !== undefined) {
    return {
      title: formatHttpStatusTitle(status, readStatusText(error)),
      message: t("route.requestFailed.message"),
    };
  }

  if (error instanceof Error) {
    return {
      title: t("route.somethingWentWrong.title"),
      message: error.message,
    };
  }

  return {
    title: t("route.somethingWentWrong.title"),
    message: t("route.unexpected.message"),
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
