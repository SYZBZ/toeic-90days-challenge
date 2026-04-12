import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

const REDIRECT_PARAM = "redirect";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const currentUrl = new URL(window.location.href);
const redirectPath = currentUrl.searchParams.get(REDIRECT_PARAM);

if (redirectPath) {
  const normalizedPath = redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`;
  const targetPath = `${basePath}${normalizedPath}`;
  window.history.replaceState(null, "", targetPath);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
      return;
    }

    // Dev mode: unregister old SW to avoid stale-cache white screens.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
