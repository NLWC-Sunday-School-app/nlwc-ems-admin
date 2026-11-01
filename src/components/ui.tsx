import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import { explainError } from "../lib/format";

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  const text = e ? explainError(e.code, e.message) : "Something went wrong. Try again.";
  return (
    <div className="alert bad" role="alert">
      <div><b>{e?.status === 403 ? "You can’t do that" : "That didn’t work"}</b>{text}{e?.code && <span className="mono xs muted"> ({e.code})</span>}</div>
    </div>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <p className="muted" role="status">{what}…</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <p>{children}</p>}</div>;
}

export function Forbidden({ need }: { need: string }) {
  return (
    <div className="alert warn" role="status">
      <div><b>Not available to your role</b>This screen needs <span className="mono">{need}</span>{" "}on this edition. Ask a Super Admin if you should have it.</div>
    </div>
  );
}

export function Pager({ page, max, count, onPage }: { page: number; max: number; count: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / max));
  return (
    <div className="row between sm" style={{ padding: "var(--space-3) var(--space-4)" }}>
      <span className="muted">{count === 0 ? "No rows" : `${page * max + 1}–${Math.min(count, (page + 1) * max)} of ${count}`}</span>
      <span className="row">
        <button className="btn btn-secondary btn-sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous</button>
        <span aria-live="polite">Page {page + 1} of {pages}</span>
        <button className="btn btn-secondary btn-sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </div>
  );
}

export function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle}
      className={`switch${on ? " on" : ""}`} style={{ background: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <i /><span>{on ? "On" : "Off"}</span>
    </button>
  );
}

/** Every dangerous action asks why. The reason goes to the API and the audit log. */
export function ReasonDialog({ title, description, confirmLabel, danger, open, busy, error, onCancel, onConfirm, children }: {
  title: string; description?: ReactNode; confirmLabel: string; danger?: boolean; open: boolean; busy?: boolean; error?: unknown;
  onCancel: () => void; onConfirm: (reason: string) => void; children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [reason, setReason] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setReason(""); d.showModal?.(); }
    if (!open && d.open) d.close();
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim()) onConfirm(reason.trim());
  };

  return (
    <dialog ref={ref} className="dlg" aria-labelledby={`${uid}-title`} onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <form onSubmit={submit} className="stack-4" style={{ display: "grid", gap: "var(--space-4)" }}>
        <h2 id={`${uid}-title`}>{title}</h2>
        {description && <div className="sm muted">{description}</div>}
        {children}
        <div className="field">
          <label htmlFor={`${uid}-reason`}>Reason <span className="muted">(required, recorded in the audit log)</span></label>
          <textarea id={`${uid}-reason`} className="textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </div>
        <ErrorAlert error={error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy || !reason.trim()}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
