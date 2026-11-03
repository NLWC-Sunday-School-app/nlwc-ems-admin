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
  minAge?: number | null;
  maxAge?: number | null;
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
  minAge?: number | null;
  maxAge?: number | null;
  campMinAge?: number | null;
  campMaxAge?: number | null;
  campCapacity?: number | null;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
};

export type UpdateEditionInput = {
  name: string;
  minAge: number | null;
  maxAge: number | null;
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

export type StaffRegistrationDetail = {
  id: string;
  reference: string;
  editionId: string;
  state: RegistrationState;
  participationMode: ParticipationMode;
  ageBand: string | null;
  ageOnReferenceDate: number | null;
  dateCreated: string;
  hasHealthFlags: boolean | null;
  cancellable: boolean;
  person: { personId: string; givenName: string; familyName: string; dateOfBirth: string | null; gender: string | null; country: string | null; city: string | null };
  actors: { personId: string; name: string; role: string }[];
  consents: { kind: string; accepted: boolean; documentVersion: number; at: string }[];
  emergencyContact: { fullName: string; relationship: string } | null;
  history: { from: RegistrationState | null; to: RegistrationState; actor: string | null; reason: string | null; at: string }[];
};

export type StaffDashboard = {
  total: number;
  byState: Partial<Record<RegistrationState, number>>;
  byMode: Partial<Record<ParticipationMode, number>>;
  byAgeBand: Record<string, number>;
  needsAction: number;
  staleDrafts: number;
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

export type PersonSummary = { id: string; givenName: string; familyName: string; dateOfBirth: string | null; city: string | null; country: string | null; registrations: number };
export type PersonDetail = {
  person: PersonSummary;
  gender: string | null;
  relations: { relation: "Spouse" | "Guardian" | "Dependant"; personId: string; name: string }[];
  registrations: { id: string; reference: string; editionName: string; state: RegistrationState; mode: ParticipationMode }[];
};
export type DuplicatePair = { a: PersonSummary; b: PersonSummary };

export type CampDecisionKind = "Approved" | "Waitlisted" | "Declined";
export type CampQueueItem = {
  registrationId: string; reference: string; personId: string; givenName: string; familyName: string; age: number | null;
  state: RegistrationState; guardianConsentGiven: boolean; hasHealthFlags: boolean | null;
  decision: CampDecisionKind | null; decisionReason: string | null; decidedAt: string | null;
};
export type CampQueue = { capacity: number | null; approved: number; rows: CampQueueItem[] };
