import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";

/** OOXML editing protection verifiers; these do not encrypt document contents. */
export type ProtectionPassword =
  | { kind: "legacy"; hash: string }
  | {
      kind: "hash";
      algorithmName: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
      saltValue: string;
      hashValue: string;
      spinCount: number;
    };

const algorithms = { "SHA-1": sha1, "SHA-256": sha256, "SHA-384": sha384, "SHA-512": sha512 };
export const PROTECTION_PASSWORD_SPINS = 100_000;

export function normalizeProtectionPassword(
  value: ProtectionPassword | undefined,
): ProtectionPassword | undefined {
  if (value === undefined) return undefined;
  if (
    value?.kind === "legacy" &&
    typeof value.hash === "string" &&
    /^[0-9a-f]{1,4}$/i.test(value.hash)
  )
    return { kind: "legacy", hash: value.hash.toUpperCase().padStart(4, "0") };
  if (
    !value ||
    value.kind !== "hash" ||
    !Object.hasOwn(algorithms, value.algorithmName) ||
    !Number.isSafeInteger(value.spinCount) ||
    value.spinCount < 0 ||
    value.spinCount > 1_000_000 ||
    typeof value.saltValue !== "string" ||
    typeof value.hashValue !== "string"
  )
    throw new Error("Invalid protection password verifier.");
  const salt = base64.decode(value.saltValue),
    hash = base64.decode(value.hashValue);
  if (
    salt.length < 1 ||
    salt.length > 64 ||
    hash.length !== algorithms[value.algorithmName].outputLen
  )
    throw new Error("Invalid protection password verifier.");
  return {
    kind: "hash",
    algorithmName: value.algorithmName,
    saltValue: value.saltValue,
    hashValue: value.hashValue,
    spinCount: value.spinCount,
  };
}

function hashPassword(
  password: string,
  salt: Uint8Array,
  spinCount: number,
  algorithm: keyof typeof algorithms,
): string {
  const utf16 = new Uint8Array(password.length * 2);
  const view = new DataView(utf16.buffer);
  for (let index = 0; index < password.length; index++)
    view.setUint16(index * 2, password.charCodeAt(index), true);
  const initial = new Uint8Array(salt.length + utf16.length);
  initial.set(salt);
  initial.set(utf16, salt.length);
  const hash = algorithms[algorithm];
  let result: Uint8Array = hash(initial);
  const round = new Uint8Array(result.length + 4),
    counter = new DataView(round.buffer);
  for (let index = 0; index < spinCount; index++) {
    round.set(result);
    counter.setUint32(result.length, index, true);
    result = hash(round);
  }
  return base64.encode(result);
}

export function createProtectionPassword(
  password: string,
  salt: Uint8Array,
  spinCount = PROTECTION_PASSWORD_SPINS,
): ProtectionPassword {
  if (
    !password ||
    password.length > 255 ||
    salt.length < 16 ||
    salt.length > 64 ||
    !Number.isSafeInteger(spinCount) ||
    spinCount < 0 ||
    spinCount > 1_000_000
  )
    throw new Error("Invalid protection password parameters.");
  return {
    kind: "hash",
    algorithmName: "SHA-512",
    saltValue: base64.encode(salt),
    hashValue: hashPassword(password, salt, spinCount, "SHA-512"),
    spinCount,
  };
}

export function verifyProtectionPassword(
  password: string,
  verifier: ProtectionPassword | undefined,
): boolean {
  if (!verifier) return true;
  if (password.length > 255) return false;
  const normalized = normalizeProtectionPassword(verifier)!;
  if (normalized.kind === "legacy") {
    let hash = 0;
    for (let index = password.length - 1; index >= 0; index--)
      hash = (((hash >> 14) & 1) | ((hash << 1) & 0x7fff)) ^ password.charCodeAt(index);
    hash = (((hash >> 14) & 1) | ((hash << 1) & 0x7fff)) ^ password.length ^ 0xce4b;
    return hash.toString(16).toUpperCase().padStart(4, "0") === normalized.hash;
  }
  const actual = base64.decode(
    hashPassword(
      password,
      base64.decode(normalized.saltValue),
      normalized.spinCount,
      normalized.algorithmName,
    ),
  );
  const expected = base64.decode(normalized.hashValue);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < actual.length; index++)
    difference |= actual[index]! ^ expected[index]!;
  return difference === 0;
}
