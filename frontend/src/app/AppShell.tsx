import { Outlet } from "react-router-dom";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppShell() {
  return (
    <>
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl justify-end">
          <LanguageSwitcher />
        </div>
      </header>

      <Outlet />
    </>
  );
}