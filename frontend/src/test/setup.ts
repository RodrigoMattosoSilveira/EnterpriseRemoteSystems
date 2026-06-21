import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

function installCompleteLocalStorageWhenNeeded(): void {
  if (typeof window.localStorage.clear === "function") {
    return;
  }

  const store = new Map<string, string>();
  const existingStorage = window.localStorage;

  for (let index = 0; index < existingStorage.length; index += 1) {
    const key = existingStorage.key(index);
    if (key) {
      const value = existingStorage.getItem(key);
      if (value !== null) {
        store.set(key, value);
      }
    }
  }

  const completeLocalStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: completeLocalStorage,
  });
}

installCompleteLocalStorageWhenNeeded();
beforeEach(() => {
  installCompleteLocalStorageWhenNeeded();
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
