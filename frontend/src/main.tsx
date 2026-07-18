import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ensureDefaultRequestActorStored } from "./api/requestActorBootstrap";
import "./styles/index.css";

ensureDefaultRequestActorStored(window.localStorage);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);