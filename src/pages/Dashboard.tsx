import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { CAPABILITY_LABEL, STAGES, STAGE_LABEL, formatDateRange, stageBadge } from "../lib/format";
import { useSession } from "../lib/session";
import type { Edition, Pager, RegistrationState, StaffRegistration } from "../lib/types";
import { Empty, Forbidden } from "../components/ui";

const COUNTED: { state: RegistrationState; label: string; hint: string }[] = [
  { state: "Draft", label: "Drafts", hint: "Started, not submitted" },
  { state: "Submitted", label: "Submitted", hint: "Waiting on payment or review" },
  { state: "Confirmed", label: "Confirmed", hint: "Complete" },
  { state: "NeedsAction", label: "Needs action", hint: "Waiting on the family" },
  { state: "Cancelled", label: "Cancelled", hint: "Slot released" },
];

export function Dashboard() {
  const { edition: summary, editionId, can, editions } = useSession();
  const canView = can("registrations:view");
  // The full edition (capabilities, timezone) needs config:view; other roles still get the header from the summary.
  const detail = useQuery({ queryKey: ["edition", editionId], enabled: !!editionId && can("config:view"), retry: false, queryFn: () => api.get<Edition>(`edition/${editionId}`) });
  const edition = detail.data;

  // One cheap request per state: the queue already returns an exact `count`, so no separate stats endpoint is needed yet.
  const counts = useQueries({
    queries: COUNTED.map((c) => ({
      queryKey: ["reg-count", editionId, c.state],
      enabled: !!editionId && canView,
      queryFn: () => api.get<Pager<StaffRegistration>>("admin/registration", { editionId, state: c.state, max: 1 }),
    })),
  });

  if (!summary) {
    return (
      <section>
        <div className="page-h"><div><h1>Dashboard</h1></div></div>
        {editions.length === 0
          ? <Empty title="No editions yet">{can("config:edit", false) ? <>Create the first edition under <Link to="/editions">Event editions</Link>.</> : "You have no editions yet."}</Empty>
          : <Empty title="Choose an edition">Use the switcher at the top.</Empty>}
      </section>
    );
  }
  if (!edition) {
    return (
      <section>
        <div className="page-h"><div><h1>{summary.name}</h1></div></div>
        {can("config:view") ? <p className="muted">Loading…</p> : <Forbidden need="config:view" />}
        {canView && <Counts counts={counts} />}
      </section>
    );
  }

  const stageIndex = edition.stage ? STAGES.indexOf(edition.stage) : -1;
  const enabled = edition.capabilities.filter((c) => c.enabled);

  return (
    <section>
      <div className="page-h">
        <div><h1>{edition.name}</h1><p>{formatDateRange(edition.startsOn, edition.endsOn)} · {edition.timezone}</p></div>
        <span className={`badge ${stageBadge(edition.stage)}`}>{edition.stage ? STAGE_LABEL[edition.stage] : "Unknown stage"}</span>
      </div>

      {!canView ? <Forbidden need="registrations:view" /> : <Counts counts={counts} />}

      <div className="grid g2" style={{ marginTop: "var(--space-4)" }}>
        <div className="card">
          <div className="card-h"><h3>Lifecycle</h3><Link to="/editions/$editionId" params={{ editionId: edition.id }} className="btn btn-secondary btn-sm">Manage</Link></div>
          <ol className="stepper">
            {STAGES.map((s, i) => <li key={s} className={i < stageIndex ? "done" : i === stageIndex ? "cur" : undefined}>{STAGE_LABEL[s]}</li>)}
          </ol>
        </div>
        <div className="card">
          <div className="card-h"><h3>Switched on for this edition</h3></div>
          {enabled.length === 0 ? <p className="muted sm">No capabilities are on. Turn them on under Event editions.</p>
            : <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{enabled.map((c) => <li key={c.capability}>{CAPABILITY_LABEL[c.capability] ?? c.capability}</li>)}</ul>}
        </div>
      </div>
      <p className="xs muted" style={{ marginTop: "var(--space-4)" }}>
        Numbers come straight from the registrations queue. Revenue, capacity and check-in figures appear here once those modules exist.
      </p>
    </section>
  );
}

function Counts({ counts }: { counts: UseQueryResult<Pager<StaffRegistration>>[] }) {
  return (
    <div className="grid g4" aria-label="Registrations by state">
      {COUNTED.map((c, i) => (
        <div className="kpi" key={c.state}>
          <div className="l">{c.label}</div>
          <div className="v">{counts[i].isLoading ? "…" : counts[i].isError ? "—" : counts[i].data?.count ?? 0}</div>
          <div className="s">{counts[i].isError ? "Could not load" : c.hint}</div>
        </div>
      ))}
    </div>
  );
}
