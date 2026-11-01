import { useState } from "react";

const KEY = "nlwc-theme"; // same key as @nlwc/ui/theme.js, so the choice carries between surfaces

const read = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const current = () => document.documentElement.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** Apply the saved choice before first paint, so there is no flash of the wrong theme. */
export function applySavedTheme() {
  const saved = read();
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(current);
  const dark = theme === "dark";
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch { /* storage can be blocked */ }
    setTheme(next);
  };
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-pressed={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      </svg>
    </button>
  );
}
