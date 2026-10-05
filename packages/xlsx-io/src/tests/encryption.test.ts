import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as CFB from "cfb";
import {
  decryptOfficeFile,
  encryptOfficeFile,
  isOfficeEncryptedFile,
  OfficeEncryptionError,
} from "../encryption.js";

// Independent Office Agile fixture from nolze/msoffcrypto-tool, commit
// 6d9e72c58de2cf7df1ab45ac0d74ebedac8c58e3:
// https://github.com/nolze/msoffcrypto-tool/blob/6d9e72c58de2cf7df1ab45ac0d74ebedac8c58e3/tests/inputs/example_password.xlsx
// Expected bytes: tests/outputs/example.xlsx in the same repository/commit.
// Password documented in tests/test_cli.sh; source license: MIT.
const encryptedFixture = new Uint8Array(
  readFileSync(new URL("./fixtures/msoffcrypto-example-encrypted.xlsx", import.meta.url)),
);
const plainFixture = new Uint8Array(
  readFileSync(new URL("./fixtures/msoffcrypto-example.xlsx", import.meta.url)),
);

function expectEncryptionError(action: () => unknown, code: OfficeEncryptionError["code"]) {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(OfficeEncryptionError);
  expect((thrown as OfficeEncryptionError).code).toBe(code);
}

function modifyStream(bytes: Uint8Array, name: string, modify: (stream: Uint8Array) => void) {
  const compoundFile = CFB.read(bytes, { type: "array" });
  const entry = CFB.find(compoundFile, name);
  if (!entry?.content) throw new Error(`Missing test stream: ${name}`);
  const stream = new Uint8Array(entry.content);
  modify(stream);
  CFB.utils.cfb_add(compoundFile, name, stream);
  return new Uint8Array(CFB.write(compoundFile, { type: "array" }));
}

describe("Office document encryption", () => {
  test("preserves all original ZIP bytes with a Unicode password", () => {
    const password = "文档🔐繁體é";
    const encrypted = encryptOfficeFile(plainFixture, password);
    expect(isOfficeEncryptedFile(plainFixture)).toBe(false);
    expect(isOfficeEncryptedFile(encrypted)).toBe(true);
    expect(decryptOfficeFile(encrypted, password)).toEqual(plainFixture);
  });

  test("preserves bytes across multiple 4096-byte package chunks and an uneven final chunk", () => {
    const original = Uint8Array.from({ length: 4096 * 3 + 17 }, (_, index) => (index * 31) % 256);
    original.set([0x50, 0x4b, 0x03, 0x04]);
    expect(decryptOfficeFile(encryptOfficeFile(original, "chunks"), "chunks")).toEqual(original);
  });

  test("generates fresh encryption salts and package keys on every export", () => {
    const first = encryptOfficeFile(plainFixture, "same-password");
    const second = encryptOfficeFile(plainFixture, "same-password");
    expect(first).not.toEqual(second);
    expect(decryptOfficeFile(first, "same-password")).toEqual(plainFixture);
    expect(decryptOfficeFile(second, "same-password")).toEqual(plainFixture);
  });

  test("decrypts independently produced Office Agile XLSX without rewriting ZIP contents", () => {
    expect(isOfficeEncryptedFile(encryptedFixture)).toBe(true);
    expect(decryptOfficeFile(encryptedFixture, "Password1234_")).toEqual(plainFixture);
  });

  test("requires a password and distinguishes wrong passwords", () => {
    expectEncryptionError(() => encryptOfficeFile(plainFixture, ""), "password-required");
    expectEncryptionError(() => decryptOfficeFile(encryptedFixture, ""), "password-required");
    expectEncryptionError(
      () => decryptOfficeFile(encryptedFixture, "wrong-password"),
      "incorrect-password",
    );
  });

  test("rejects a tampered encrypted package using Office data integrity", () => {
    const tampered = modifyStream(encryptedFixture, "EncryptedPackage", (stream) => {
      stream[24] = stream[24]! ^ 0x80;
    });
    expectEncryptionError(
      () => decryptOfficeFile(tampered, "Password1234_"),
      "invalid-encrypted-file",
    );
  });

  test("rejects unsupported encryption versions", () => {
    const unsupported = modifyStream(encryptedFixture, "EncryptionInfo", (stream) => {
      stream[0] = 0x03;
      stream[2] = 0x03;
    });
    expectEncryptionError(
      () => decryptOfficeFile(unsupported, "Password1234_"),
      "unsupported-encryption",
    );
  });

  test("rejects malformed encrypted files", () => {
    expectEncryptionError(
      () => decryptOfficeFile(new Uint8Array([0xd0, 0xcf, 0x11]), "password"),
      "invalid-encrypted-file",
    );
  });
});
