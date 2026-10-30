import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$garbage")).toBe(false);
  });
  it("salts each hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });
});

describe("passwordProblem", () => {
  it("accepts a reasonable password", () => expect(passwordProblem("sleep-and-memory-2026", "ana@uni.edu")).toBeNull());
  it("rejects short, common, repeated and email-based passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/);
    expect(passwordProblem("password123")).toMatch(/too easy/);
    expect(passwordProblem("aaaaaaaaaa")).toMatch(/too easy/);
    expect(passwordProblem("drsmith2026!", "drsmith@uni.edu")).toMatch(/email/);
  });
});
