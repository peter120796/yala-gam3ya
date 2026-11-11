import { describe, expect, it } from "vitest";
import { decodeSessionCookie, encodeSessionCookie } from "./cookie";

describe("__session cookie", () => {
  it("round-trips session + locale", () => {
    expect(decodeSessionCookie(encodeSessionCookie({ s: "abc.def", l: "en" }))).toEqual({ s: "abc.def", l: "en" });
    expect(decodeSessionCookie(encodeSessionCookie({ l: "ar" }))).toEqual({ s: undefined, l: "ar" });
  });
  it("ignores garbage and bad values safely", () => {
    expect(decodeSessionCookie("%%%")).toEqual({});
    expect(decodeSessionCookie(Buffer.from('{"l":"fr","s":5}').toString("base64url"))).toEqual({ s: undefined, l: undefined });
    expect(decodeSessionCookie(undefined)).toEqual({});
  });
});
