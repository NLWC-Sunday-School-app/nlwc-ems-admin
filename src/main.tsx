import { createRoot } from "react-dom/client";
import "@nlwc/ui/tokens.css";
import "@nlwc/ui/components.css";
import "./app.css";
import { App } from "./app";
import { applySavedTheme } from "./components/ThemeToggle";

applySavedTheme();

createRoot(document.getElementById("root")!).render(<App />);
