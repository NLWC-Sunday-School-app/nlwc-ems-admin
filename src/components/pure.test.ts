import { describe, expect, it } from "vitest";
import { groupSecret, secretFromOtpauth } from "./Auth";
import { heldLevel } from "../pages/Staff";
import { prettyDetail } from "../pages/Audit";

describe("authenticator setup", () => {
  it("pulls the secret out of the otpauth link and groups it for typing", () => {
    const uri = "otpauth://totp/NLWC%20EMS:admin%40example.com?secret=FN7IO3UC5GKKVXU6&issuer=NLWC%20EMS&digits=6";
    expect(secretFromOtpauth(uri)).toBe("FN7IO3UC5GKKVXU6");
    expect(groupSecret("FN7IO3UC5GKKVXU6")).toBe("FN7I O3UC 5GKK VXU6");
    expect(secretFromOtpauth("not a uri")).toBe("");
  });
});

describe("role matrix", () => {
  const role = { id: "r", key: "medical_welfare", name: "Medical", permissions: [
    { resource: "health", level: "flags" }, { resource: "health", level: "full" }, { resource: "health", level: "view" }, { resource: "registrations", level: "view" },
  ] };
  it("shows the highest level held on a resource, or none", () => {
    expect(heldLevel(role, "health")).toBe("full");
    expect(heldLevel(role, "registrations")).toBe("view");
    expect(heldLevel(role, "money")).toBeNull();
  });
});

describe("audit detail", () => {
  it("indents JSON and leaves anything else alone", () => {
    expect(prettyDetail('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyDetail("not json")).toBe("not json");
  });
});
