import { useSyncExternalStore } from "react";
import {
  getAuthState,
  subscribeAuthState,
  type AuthState,
} from "./authStore";

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuthState, getAuthState, getAuthState);
}
