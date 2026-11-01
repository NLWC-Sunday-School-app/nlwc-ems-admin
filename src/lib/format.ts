import type { AccessMe, EditionStage, ParticipationMode, Permission, RateKind, RateRuleInput, RegistrationState } from "./types";

/** Integer kobo to "₦5,000" (whole naira) or "₦5,000.50". */
export function formatKobo(kobo: number): string {
  const naira = kobo / 100;
  return "₦" + naira.toLocaleString("en-NG", { minimumFractionDigits: Number.isInteger(naira) ? 0 : 2, maximumFractionDigits: 2 });
}

/** "5000" or "5,000.5" to integer kobo; null when it is not a positive amount with at most two decimals. */
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[,\s₦]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const kobo = Math.round(Number(cleaned) * 100);
  return kobo > 0 ? kobo : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

/** "21–23 Dec 2026", "30 Dec 2026 – 2 Jan 2027" or "21 Dec 2026". */
export function formatDateRange(start: string, end: string): string {
  const a = parts(start), b = parts(end);
  if (start === end) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export const STAGES: EditionStage[] = ["Draft", "Preview", "RegistrationOpen", "Closed", "Live", "Completed", "Archived"];

export const STAGE_LABEL: Record<EditionStage, string> = {
  Draft: "Draft", Preview: "Preview", RegistrationOpen: "Registration open", Closed: "Registration closed", Live: "Live", Completed: "Completed", Archived: "Archived",
};

/** Mirrors EditionLifecycle on the API. The API still decides; this only offers the buttons that can work. */
const TRANSITIONS: Record<EditionStage, EditionStage[]> = {
  Draft: ["Preview"],
  Preview: ["Draft", "RegistrationOpen"],
  RegistrationOpen: ["Closed"],
  Closed: ["RegistrationOpen", "Live"],
  Live: ["Completed"],
  Completed: ["Archived"],
  Archived: [],
};

export const nextStages = (from: EditionStage | null): EditionStage[] => (from ? TRANSITIONS[from] : []);

export const stageBadge = (stage: EditionStage | null): string =>
  stage === "RegistrationOpen" || stage === "Live" ? "b-ok" : stage === "Closed" ? "b-warn" : stage === "Archived" ? "b-neutral" : stage ? "b-info" : "b-bad";

export const CAPABILITY_LABEL: Record<string, string> = {
  Accommodation: "Accommodation",
  DailyCheckin: "Daily child check-in/out (3–16)",
  CampReview: "Camp review",
  StudioRequests: "Studio requests",
  ParentForum: "Parent Interactive Forum",
  PaidRegistration: "Paid registration",
};

export const STATE_BADGE: Record<RegistrationState, string> = {
  Draft: "b-neutral", ProvisionalPendingClaim: "b-warn", Submitted: "b-info", NeedsAction: "b-warn", Confirmed: "b-ok",
  Completed: "b-ok", Cancelled: "b-neutral", Rejected: "b-bad", Expired: "b-neutral",
};

export const MODE_LABEL: Record<ParticipationMode, string> = { Day: "Walk-in (day)", Camp: "Camp (request)", Online: "Online" };

export const CONDITION_LABEL: Record<string, string> = {
  fatigue: "Fatigue", dry_cough: "Dry cough", fever: "Fever", loss_of_taste_smell: "Loss of taste/smell", headache: "Headache", sore_throat: "Sore throat",
  nausea: "Nausea", breathing_difficulty: "Breathing difficulty", blocked_nose: "Blocked/running nose", asthma: "Asthma", ulcer: "Ulcer", sickle_cell: "Sickle cell", other: "Other",
};

/** True when a permission (church-wide, or for this edition) is held. The API expands levels, so health:full already lists health:view. */
export function can(permissions: Permission[], code: string, editionId?: string | null): boolean {
  return permissions.some((p) => p.code === code && (p.editionId === null || p.editionId === (editionId ?? null)));
}

export const canAny = (permissions: Permission[], codes: string[], editionId?: string | null) => codes.some((c) => can(permissions, c, editionId));

/** Why a screen is unavailable, in words a staff member can act on. */
export function permissionHint(access: AccessMe | undefined, code: string, editionId?: string | null): string | null {
  if (!access) return null;
  if (can(access.permissions, code, editionId)) return null;
  return `You need ${code} for this. Ask a Super Admin to grant it.`;
}

/** What the API's error codes mean to a person, where the server's own message is not enough. */
export function explainError(code: string | null, fallback: string): string {
  switch (code) {
    case "mfa_required": return "This needs an MFA-verified session. Enter your authenticator code to continue.";
    case "pricing_not_published": return "Publish a price (a Free rule counts) before opening registration.";
    case "invalid_code": return "That code is not correct. Codes change every 30 seconds.";
    case "bad_origin": return "This request was blocked for your protection. Reload the page and try again.";
    case "reason_required": return "Say why you are opening this record.";
    default: return fallback;
  }
}

export type RuleDraft = { ageMin: string; ageMax: string; mode: ParticipationMode | ""; kind: RateKind; naira: string };

/** Turns the rule editor's rows into API input, or the problems to show. */
export function buildRules(rows: RuleDraft[]): { rules: RateRuleInput[]; errors: string[] } {
  const errors: string[] = [];
  const rules: RateRuleInput[] = [];
  if (rows.length === 0) errors.push("Add at least one rule. A missing rule means “price not set”, not free.");
  rows.forEach((r, i) => {
    const n = i + 1;
    const ageMin = Number(r.ageMin);
    const ageMax = r.ageMax.trim() === "" ? null : Number(r.ageMax);
    if (r.ageMin.trim() === "" || !Number.isInteger(ageMin) || ageMin < 0 || ageMin > 120) errors.push(`Rule ${n}: minimum age must be 0–120.`);
    if (ageMax !== null && (!Number.isInteger(ageMax) || ageMax < ageMin || ageMax > 120)) errors.push(`Rule ${n}: maximum age must be at least the minimum, up to 120.`);
    let amountKobo: number | null = null;
    if (r.kind === "Amount") {
      amountKobo = nairaToKobo(r.naira);
      if (amountKobo === null) errors.push(`Rule ${n}: enter an amount in naira, such as 5000.`);
    }
    rules.push({ ageMin, ageMax, participationMode: r.mode === "" ? null : r.mode, kind: r.kind, amountKobo });
  });
  return { rules, errors };
}

export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : "—");
