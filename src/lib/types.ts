// Shapes returned by nlwc-ems.api. Kept by hand next to the C# DTOs; regenerate from OpenAPI once a client generator is chosen.

export type Envelope<T> = { success: boolean; message: string | null; code: string | null; data: T };

export type EditionStage = "Draft" | "Preview" | "RegistrationOpen" | "Closed" | "Live" | "Completed" | "Archived";
export type RegistrationWindow = "NotOpen" | "Open" | "Closed";
export type RegistrationState =
  | "Draft" | "ProvisionalPendingClaim" | "Submitted" | "NeedsAction" | "Confirmed" | "Completed" | "Cancelled" | "Rejected" | "Expired";
export type ParticipationMode = "Day" | "Camp" | "Online";
export type Capability = "Accommodation" | "DailyCheckin" | "CampReview" | "StudioRequests" | "ParentForum" | "PaidRegistration";
export type RateKind = "Amount" | "Free";

export type Me = { personId: string; surface: string; mfaVerified: boolean; emailVerified: boolean; mfaEnrolled: boolean };

/** One row of `edition/mine`: what the switcher needs, for any role that holds a grant. */
export type EditionSummary = { id: string; slug: string; code: string; name: string; startsOn: string; endsOn: string; stage: EditionStage | null };
export type LoginResult = { csrfToken: string; mfaVerified: boolean; emailVerified: boolean };
export type Permission = { code: string; editionId: string | null };
export type AccessMe = { mfaVerified: boolean; permissions: Permission[] };

export type EditionCapability = { capability: Capability; enabled: boolean };
export type EventDay = { day: string; label: string | null };
export type Edition = {
  id: string;
  slug: string;
  code: string;
  name: string;
  timezone: string;
  startsOn: string;
  endsOn: string;
  ageReferenceDate: string;
  campMinAge: number | null;
  campMaxAge: number | null;
  campCapacity: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  visibility: string;
  registrationWindow: RegistrationWindow;
  liveState: string;
  stage: EditionStage | null;
  venue: { name: string; address: string | null } | null;
  days: EventDay[];
  capabilities: EditionCapability[];
};

export type CreateEditionInput = {
  templateCode: string;
  slug: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  venueName?: string;
  venueAddress?: string;
  campMinAge?: number | null;
  campMaxAge?: number | null;
  campCapacity?: number | null;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
};

export type UpdateEditionInput = {
  name: string;
  campMinAge: number | null;
  campMaxAge: number | null;
  campCapacity: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
};

export type RateVersion = {
  versionId: string;
  version: number;
  state: "Draft" | "Approved" | "Published" | "Retired";
  draftedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  note: string | null;
  rules: RateRuleInput[];
};

export type StaffLookup = { accountId: string; email: string; givenName: string; familyName: string };

export type RateRuleInput = {
  ageMin: number;
  ageMax: number | null;
  participationMode: ParticipationMode | null;
  accommodationCategory?: string | null;
  kind: RateKind;
  amountKobo: number | null;
};

export type Pager<T> = { page: number; max: number; count: number; data: T[] };

export type StaffRegistration = {
  id: string;
  reference: string;
  personId: string;
  givenName: string;
  familyName: string;
  state: RegistrationState;
  participationMode: ParticipationMode;
  ageBand: string | null;
  hasHealthFlags: boolean | null;
  dateCreated: string;
};

export type Health = { none: boolean; conditions: string[]; allergies: string | null; notes: string | null } | null;

export type RolePermission = { resource: string; level: string };
export type Role = { id: string; key: string; name: string; permissions: RolePermission[] };
export type RoleGrant = {
  id: string;
  accountId: string;
  roleId: string;
  editionId: string | null;
  grantedBy: string;
  reason: string;
  expiresAt: string | null;
  revokedAt: string | null;
  dateCreated: string;
  role: { key: string; name: string } | null;
};

export type AuditEvent = {
  seq: number;
  id: string;
  occurredAt: string;
  actorAccountId: string | null;
  action: string;
  entityType: string;
  recordId: string | null;
  displayName: string | null;
  editionId: string | null;
  reason: string | null;
  detail: string;
  hash: string;
};
