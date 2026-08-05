import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ensureSelectedTenantStored } from "./api/tenantSelection";
import { initializeAuthSession } from "./app/authStore";
import "./styles/index.css";
import "./app/i18n";

ensureSelectedTenantStored(window.localStorage);
void initializeAuthSession();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);