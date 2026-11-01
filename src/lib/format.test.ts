import { describe, expect, it } from "vitest";
import { buildRules, can, canAny, explainError, formatDateRange, formatKobo, nairaToKobo, nextStages, permissionHint, shortId, stageBadge } from "./format";

describe("money", () => {
  it("formats whole-naira and fractional kobo", () => {
    expect(formatKobo(500000)).toBe("₦5,000");
    expect(formatKobo(1234550)).toBe("₦12,345.50");
    expect(formatKobo(0)).toBe("₦0");
  });
  it("parses naira input to integer kobo and refuses the rest", () => {
    expect(nairaToKobo("5000")).toBe(500000);
    expect(nairaToKobo("₦5,000.5")).toBe(500050);
    expect(nairaToKobo("0.07")).toBe(7);
    expect(nairaToKobo("0")).toBeNull();
    expect(nairaToKobo("12.345")).toBeNull();
    expect(nairaToKobo("-5")).toBeNull();
    expect(nairaToKobo("abc")).toBeNull();
    expect(nairaToKobo("")).toBeNull();
  });
});

describe("dates", () => {
  it("formats ranges within and across months and years", () => {
    expect(formatDateRange("2026-12-21", "2026-12-23")).toBe("21–23 Dec 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatDateRange("2026-11-29", "2026-12-02")).toBe("29 Nov 2026 – 2 Dec 2026");
    expect(formatDateRange("2026-12-21", "2026-12-21")).toBe("21 Dec 2026");
  });
});

describe("edition lifecycle", () => {
  it("offers only the moves the API allows", () => {
    expect(nextStages("Draft")).toEqual(["Preview"]);
    expect(nextStages("Preview")).toEqual(["Draft", "RegistrationOpen"]);
    expect(nextStages("Closed")).toEqual(["RegistrationOpen", "Live"]);
    expect(nextStages("Archived")).toEqual([]);
    expect(nextStages(null)).toEqual([]);
  });
  it("never offers a jump over a stage", () => {
    expect(nextStages("Draft")).not.toContain("RegistrationOpen");
    expect(nextStages("RegistrationOpen")).not.toContain("Live");
  });
  it("colours open and live as ok and unknown as bad", () => {
    expect(stageBadge("RegistrationOpen")).toBe("b-ok");
    expect(stageBadge(null)).toBe("b-bad");
  });
});

describe("permissions", () => {
  const perms = [{ code: "config:view", editionId: null }, { code: "registrations:view", editionId: "e1" }];
  it("counts church-wide grants everywhere and edition grants only for that edition", () => {
    expect(can(perms, "config:view", "e2")).toBe(true);
    expect(can(perms, "config:view")).toBe(true);
    expect(can(perms, "registrations:view", "e1")).toBe(true);
    expect(can(perms, "registrations:view", "e2")).toBe(false);
    expect(can(perms, "registrations:view")).toBe(false);
    expect(can(perms, "audit:view", "e1")).toBe(false);
  });
  it("supports any-of checks and explains what is missing", () => {
    expect(canAny(perms, ["audit:view", "config:view"])).toBe(true);
    expect(permissionHint({ mfaVerified: true, permissions: perms }, "audit:view")).toContain("audit:view");
    expect(permissionHint({ mfaVerified: true, permissions: perms }, "config:view")).toBeNull();
    expect(permissionHint(undefined, "audit:view")).toBeNull();
  });
});

describe("error wording", () => {
  it("explains known codes and passes the rest through", () => {
    expect(explainError("pricing_not_published", "x")).toMatch(/publish a price/i);
    expect(explainError("mfa_required", "x")).toMatch(/authenticator/i);
    expect(explainError("something_else", "Server said no")).toBe("Server said no");
    expect(explainError(null, "Server said no")).toBe("Server said no");
  });
});

describe("rate rule drafting", () => {
  const free = { ageMin: "0", ageMax: "", mode: "" as const, kind: "Free" as const, naira: "" };
  it("builds a free-for-everyone rule", () => {
    expect(buildRules([free])).toEqual({
      errors: [], rules: [{ ageMin: 0, ageMax: null, participationMode: null, kind: "Free", amountKobo: null }],
    });
  });
  it("converts naira to kobo for an amount rule", () => {
    const { rules, errors } = buildRules([{ ageMin: "3", ageMax: "16", mode: "Camp", kind: "Amount", naira: "7,500" }]);
    expect(errors).toEqual([]);
    expect(rules[0]).toMatchObject({ ageMin: 3, ageMax: 16, participationMode: "Camp", amountKobo: 750000 });
  });
  it("refuses no rules, bad ages and missing amounts, naming the rule", () => {
    expect(buildRules([]).errors[0]).toMatch(/at least one rule/i);
    expect(buildRules([{ ...free, ageMin: "20", ageMax: "10" }]).errors[0]).toMatch(/Rule 1: maximum age/);
    expect(buildRules([{ ...free, ageMin: "" }]).errors[0]).toMatch(/Rule 1: minimum age/);
    expect(buildRules([free, { ...free, kind: "Amount" as const }]).errors).toEqual(["Rule 2: enter an amount in naira, such as 5000."]);
  });
});

describe("shortId", () => {
  it("shortens ids and tolerates missing ones", () => {
    expect(shortId("54c162c9-2d9c-4861")).toBe("54c162c9");
    expect(shortId(null)).toBe("—");
  });
});
