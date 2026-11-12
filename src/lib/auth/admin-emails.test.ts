import { afterEach, describe, expect, it } from "vitest";
import { effectiveRole, isAllowedAdminEmail } from "./admin-emails";

const original = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

describe("admin email lock", () => {
  it("keeps super_admin only for listed emails (case-insensitive)", () => {
    process.env.ADMIN_EMAILS = "Owner@Example.com, second@example.com";
    expect(effectiveRole("super_admin", "owner@example.com")).toBe("super_admin");
    expect(effectiveRole("super_admin", "SECOND@example.com")).toBe("super_admin");
    expect(effectiveRole("super_admin", "someone@example.com")).toBe("member");
    expect(effectiveRole("super_admin", null)).toBe("member");
  });
  it("fails closed when ADMIN_EMAILS is not set", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAllowedAdminEmail("owner@example.com")).toBe(false);
    expect(effectiveRole("super_admin", "owner@example.com")).toBe("member");
  });
  it("never changes organizer or member roles", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(effectiveRole("organizer", "x@example.com")).toBe("organizer");
    expect(effectiveRole("member", "owner@example.com")).toBe("member");
  });
});
