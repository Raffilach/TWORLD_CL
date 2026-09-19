import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { initAppearance } from "./shared/ui/appearance";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/app.css";

// До первого рендера: иначе на секунду мелькнёт чужая тема.
initAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
