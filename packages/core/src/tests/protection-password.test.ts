import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createProtectionPassword, verifyProtectionPassword } from "../protection-password.js";

describe("editing protection password verifiers", () => {
  test.each([0, 1, 7])("matches an independent SHA-512 UTF-16LE vector at %i spins", (spins) => {
    const password = "密碼🔐pass";
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
    let expected = createHash("sha512")
      .update(salt)
      .update(Buffer.from(password, "utf16le"))
      .digest();
    for (let index = 0; index < spins; index++) {
      const counter = Buffer.alloc(4);
      counter.writeUInt32LE(index);
      expected = createHash("sha512").update(expected).update(counter).digest();
    }
    const verifier = createProtectionPassword(password, salt, spins);
    expect(verifier).toEqual({
      kind: "hash",
      algorithmName: "SHA-512",
      saltValue: Buffer.from(salt).toString("base64"),
      hashValue: expected.toString("base64"),
      spinCount: spins,
    });
    expect(verifyProtectionPassword(password, verifier)).toBe(true);
    expect(verifyProtectionPassword("wrong", verifier)).toBe(false);
  });

  test("accepts Excel's known legacy password verifier", () => {
    expect(verifyProtectionPassword("password", { kind: "legacy", hash: "83AF" })).toBe(true);
    expect(verifyProtectionPassword("Password", { kind: "legacy", hash: "83AF" })).toBe(false);
    expect(verifyProtectionPassword("", undefined)).toBe(true);
  });
});
