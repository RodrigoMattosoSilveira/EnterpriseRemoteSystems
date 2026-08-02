import { ApiError } from "../api/client";

const MAX_TRANSIENT_RETRIES = 3;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    const status = error.status;
    if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return false;
    }
  }

  return failureCount < MAX_TRANSIENT_RETRIES;
}
