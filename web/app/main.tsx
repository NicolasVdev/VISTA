import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import VistaApp from "./VistaApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Le point de montage VISTA est introuvable.");
}

createRoot(root).render(
  <StrictMode>
    <VistaApp />
  </StrictMode>,
);
