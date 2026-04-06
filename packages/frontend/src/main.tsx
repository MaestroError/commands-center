import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <div>cc</div>
  </StrictMode>,
);
