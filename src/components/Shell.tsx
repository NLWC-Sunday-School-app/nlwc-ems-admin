import { useEffect } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { to: string; label: string; need?: string; scoped?: boolean };
const NAV: { heading: string; items: NavItem[] }[] = [
  { heading: "Overview", items: [{ to: "/", label: "Dashboard" }] },
  { heading: "Events", items: [
    { to: "/editions", label: "Event editions", need: "config:view" },
    { to: "/pricing", label: "Pricing & rate plans", need: "pricing:draft|pricing:approve" },
    { to: "/registrations", label: "Registrations", need: "registrations:view" },
    { to: "/camp", label: "Camp review", need: "registrations:view" },
    { to: "/people", label: "People", need: "people:view" },
  ] },
  { heading: "Governance", items: [
    { to: "/staff", label: "Staff & roles", need: "staff:view" },
    { to: "/audit", label: "Audit log", need: "audit:view" },
  ] },
];

export function Shell() {
  const { access, can, editions, editionId, setEditionId, signOut } = useSession();

  // The admin grid hangs off this class on the mount node (see app.css).
  useEffect(() => {
    const root = document.getElementById("root");
    root?.classList.add("admin-shell");
    return () => root?.classList.remove("admin-shell");
  }, []);

  // Hiding a link is cosmetic. Every endpoint checks again.
  const visible = (n: NavItem) => !n.need || n.need.split("|").some((c) => can(c, false) || can(c));

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side" aria-label="Admin navigation">
        <img className="logo-light" src="/nlwc-logo-coloured.png" alt="NLWC EMS admin" onError={(e) => ((e.target as HTMLElement).style.display = "none")} />
        <nav>
          {NAV.map((g) => {
            const items = g.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={g.heading}>
                <h6>{g.heading}</h6>
                {items.map((n) => <Link key={n.to} to={n.to as "/"} activeOptions={{ exact: n.to === "/" }} activeProps={{ "aria-current": "page" }}>{n.label}</Link>)}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="scope" role="group" aria-label="Edition">
            <span className="dot" aria-hidden="true" />
            <label htmlFor="edition-switch" className="sr">Edition</label>
            <select id="edition-switch" className="select" style={{ border: 0, minHeight: 28, background: "transparent", fontWeight: 600 }} value={editionId ?? ""} onChange={(e) => setEditionId(e.target.value || null)} disabled={editions.length === 0}>
              {editions.length === 0 && <option value="">No editions yet</option>}
              {editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <span style={{ marginLeft: "auto" }} className="row">
            <ThemeToggle />
            <span className="badge b-ok" title="Staff permissions are active on this session">MFA verified</span>
            <span className="badge b-neutral" title="Permissions on this edition">{access ? `${new Set(access.permissions.map((p) => p.code.split(":")[0])).size} areas` : "…"}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>Sign out</button>
          </span>
        </header>
        <main className="page" id="main" tabIndex={-1}><Outlet /></main>
      </div>
    </>
  );
}

