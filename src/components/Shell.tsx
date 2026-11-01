import { useEffect, useState } from "react";
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
  ] },
  { heading: "Governance", items: [
    { to: "/staff", label: "Staff & roles", need: "staff:view" },
    { to: "/audit", label: "Audit log", need: "audit:view" },
  ] },
];

export function Shell() {
  const { access, can, editions, editionId, setEditionId, editionsRestricted, signOut } = useSession();

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
          {editions.length === 0 && editionsRestricted ? <EditionIdEntry current={editionId} onSet={setEditionId} /> : (
            <div className="scope" role="group" aria-label="Edition">
              <span className="dot" aria-hidden="true" />
              <label htmlFor="edition-switch" className="sr">Edition</label>
              <select id="edition-switch" className="select" style={{ border: 0, minHeight: 28, background: "transparent", fontWeight: 600 }} value={editionId ?? ""} onChange={(e) => setEditionId(e.target.value || null)} disabled={editions.length === 0}>
                {editions.length === 0 && <option value="">No editions yet</option>}
                {editions.filter((e) => e.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles without config:view cannot list editions, so they paste the id they were given. Edition-scoped grants then apply. */
function EditionIdEntry({ current, onSet }: { current: string | null; onSet: (id: string | null) => void }) {
  const [value, setValue] = useState(current ?? "");
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (UUID.test(value.trim())) onSet(value.trim()); }} aria-label="Edition">
      <label htmlFor="edition-id" className="sr">Edition id</label>
      <input id="edition-id" className="input mono" style={{ minHeight: 38, width: 300 }} placeholder="Paste an edition id" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-secondary btn-sm" disabled={!UUID.test(value.trim()) || value.trim() === current}>{current ? "Switch" : "Use"}</button>
    </form>
  );
}
