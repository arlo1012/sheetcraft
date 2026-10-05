import { cbc } from "@noble/ciphers/aes.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";
import { randomBytes, type CHash } from "@noble/hashes/utils.js";
import { base64, utf8 } from "@scure/base";
import * as CFB from "cfb";
import { XMLParser } from "fast-xml-parser";

export type OfficeEncryptionCode =
  | "password-required"
  | "incorrect-password"
  | "unsupported-encryption"
  | "invalid-encrypted-file";
export class OfficeEncryptionError extends Error {
  constructor(readonly code: OfficeEncryptionCode) {
    super(code);
    this.name = "OfficeEncryptionError";
  }
}
function invalid(): never {
  throw new OfficeEncryptionError("invalid-encrypted-file");
}
function unsupported(): never {
  throw new OfficeEncryptionError("unsupported-encryption");
}
const SIGNATURE = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const PREFIX = Uint8Array.of(4, 0, 4, 0, 0x40, 0, 0, 0);
const BLOCK = {
  key: Uint8Array.of(0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6),
  input: Uint8Array.of(0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79),
  verifier: Uint8Array.of(0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e),
  hmacKey: Uint8Array.of(0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6),
  hmacValue: Uint8Array.of(0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33),
};
const MAX_BYTES = 256 * 1024 * 1024;
type Hash = CHash;
type Parameters = {
  hash: Hash;
  hashName: string;
  salt: Uint8Array;
  keyBytes: number;
  hashSize: number;
};
function le32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}
function resized(bytes: Uint8Array, size: number, fill = 0): Uint8Array {
  const result = new Uint8Array(size).fill(fill);
  result.set(bytes.subarray(0, size));
  return result;
}
function padded(bytes: Uint8Array): Uint8Array {
  return resized(bytes, Math.ceil(bytes.length / 16) * 16);
}
function utf16(text: string): Uint8Array {
  const result = new Uint8Array(text.length * 2);
  const view = new DataView(result.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return result;
}
function crypt(encrypt: boolean, key: Uint8Array, iv: Uint8Array, bytes: Uint8Array): Uint8Array {
  const cipher = cbc(key, iv, { disablePadding: true });
  return encrypt ? cipher.encrypt(padded(bytes)) : cipher.decrypt(bytes);
}
function iv(params: Parameters, block: Uint8Array): Uint8Array {
  return resized(params.hash(concatBytes(params.salt, block)), 16, 0x36);
}
function passwordHash(password: string, params: Parameters, spins: number): Uint8Array {
  let value = params.hash(concatBytes(params.salt, utf16(password)));
  for (let i = 0; i < spins; i++) value = params.hash(concatBytes(le32(i), value));
  return value;
}
function derivedKey(hash: Uint8Array, params: Parameters, block: Uint8Array): Uint8Array {
  return resized(params.hash(concatBytes(hash, block)), params.keyBytes, 0x36);
}
function unpack(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES || !SIGNATURE.every((value, index) => bytes[index] === value))
    return undefined;
  const container = CFB.read(bytes, { type: "array" });
  const info = CFB.find(container, "EncryptionInfo"),
    data = CFB.find(container, "EncryptedPackage");
  return info && data
    ? { info: new Uint8Array(info.content), data: new Uint8Array(data.content) }
    : undefined;
}
export function isOfficeEncryptedFile(bytes: Uint8Array): boolean {
  try {
    return Boolean(unpack(bytes));
  } catch {
    return false;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function encoded(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > 2048) invalid();
  try {
    return base64.decode(value);
  } catch {
    return invalid();
  }
}
function parameters(node: Record<string, unknown>): Parameters {
  if (
    node.cipherAlgorithm !== "AES" ||
    node.cipherChaining !== "ChainingModeCBC" ||
    Number(node.blockSize) !== 16
  )
    unsupported();
  const hashes: Record<string, Hash> = {
    SHA1: sha1,
    SHA256: sha256,
    SHA384: sha384,
    SHA512: sha512,
  };
  const hashName = String(node.hashAlgorithm),
    hash = hashes[hashName];
  const salt = encoded(node.saltValue),
    keyBytes = Number(node.keyBits) / 8;
  if (!hash || ![16, 24, 32].includes(keyBytes)) unsupported();
  if (
    salt.length !== Number(node.saltSize) ||
    salt.length < 1 ||
    salt.length > 64 ||
    Number(node.hashSize) !== hash.outputLen
  )
    invalid();
  return { hash, hashName, salt, keyBytes, hashSize: hash.outputLen };
}

/** MS-OFFCRYPTO 2.3.4 Agile envelope; crypto primitives are supplied by Noble. */
export function decryptOfficeFile(bytes: Uint8Array, password: string): Uint8Array {
  try {
    const container = unpack(bytes);
    if (!container) invalid();
    if (!PREFIX.every((value, index) => container.info[index] === value)) unsupported();
    if (container.info.length > 64 * 1024 || container.data.length < 24) invalid();
    const xml = utf8.encode(container.info.subarray(8));
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
    const parsed: unknown = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      removeNSPrefix: true,
      processEntities: false,
    }).parse(xml);
    const root = record(record(parsed).encryption);
    const dataParams = parameters(record(root.keyData));
    const encryptors = record(root.keyEncryptors).keyEncryptor;
    const candidates = Array.isArray(encryptors) ? encryptors : [encryptors];
    const passwordNode = candidates.find(
      (node: unknown) =>
        record(node).uri === "http://schemas.microsoft.com/office/2006/keyEncryptor/password",
    );
    if (!passwordNode) unsupported();
    const keyNode = record(record(passwordNode).encryptedKey),
      keyParams = parameters(keyNode);
    const spins = Number(keyNode.spinCount);
    if (!Number.isSafeInteger(spins) || spins < 0 || spins > 1_000_000) unsupported();
    if (!password) throw new OfficeEncryptionError("password-required");
    if (password.length > 255) throw new OfficeEncryptionError("incorrect-password");
    const hash = passwordHash(password, keyParams, spins),
      saltIV = resized(keyParams.salt, 16, 0x36);
    const decryptKeyField = (name: string, block: Uint8Array) =>
      crypt(false, derivedKey(hash, keyParams, block), saltIV, encoded(keyNode[name]));
    const input = decryptKeyField("encryptedVerifierHashInput", BLOCK.input).subarray(
      0,
      keyParams.salt.length,
    );
    const expected = decryptKeyField("encryptedVerifierHashValue", BLOCK.verifier).subarray(
      0,
      keyParams.hashSize,
    );
    if (!equalBytes(keyParams.hash(input), expected))
      throw new OfficeEncryptionError("incorrect-password");
    const key = decryptKeyField("encryptedKeyValue", BLOCK.key).subarray(0, dataParams.keyBytes);
    // Authenticate the entire encrypted stream, including its 8-byte length prefix, before exposing plaintext.
    const integrity = record(root.dataIntegrity);
    const hmacKey = crypt(
      false,
      key,
      iv(dataParams, BLOCK.hmacKey),
      encoded(integrity.encryptedHmacKey),
    ).subarray(0, dataParams.hashSize);
    const expectedHmac = crypt(
      false,
      key,
      iv(dataParams, BLOCK.hmacValue),
      encoded(integrity.encryptedHmacValue),
    ).subarray(0, dataParams.hashSize);
    if (!equalBytes(hmac(dataParams.hash, hmacKey, container.data), expectedHmac)) invalid();
    const size = new DataView(container.data.buffer, container.data.byteOffset, 8).getBigUint64(
      0,
      true,
    );
    if (
      size < 1n ||
      size > BigInt(MAX_BYTES) ||
      container.data.length !== 8 + Math.ceil(Number(size) / 16) * 16
    )
      invalid();
    const output = new Uint8Array(Number(size));
    for (let start = 0, block = 0; start < output.length; start += 4096, block++) {
      const length = Math.min(4096, output.length - start);
      const part = container.data.subarray(8 + start, 8 + start + Math.ceil(length / 16) * 16);
      output.set(crypt(false, key, iv(dataParams, le32(block)), part).subarray(0, length), start);
    }
    key.fill(0);
    hash.fill(0);
    hmacKey.fill(0);
    return output;
  } catch (error) {
    if (error instanceof OfficeEncryptionError) throw error;
    return invalid();
  }
}

export function encryptOfficeFile(bytes: Uint8Array, password: string): Uint8Array {
  if (!password) throw new OfficeEncryptionError("password-required");
  if (password.length > 255 || bytes.length < 1 || bytes.length > MAX_BYTES) invalid();
  const random = (size: number) => randomBytes(size);
  const makeParams = (): Parameters => ({
    hash: sha512,
    hashName: "SHA512",
    salt: random(16),
    keyBytes: 32,
    hashSize: 64,
  });
  const dataParams = makeParams(),
    keyParams = makeParams(),
    key = random(32),
    spins = 100_000;
  const encrypted = new Uint8Array(8 + Math.ceil(bytes.length / 16) * 16);
  new DataView(encrypted.buffer).setBigUint64(0, BigInt(bytes.length), true);
  for (let start = 0, block = 0; start < bytes.length; start += 4096, block++)
    encrypted.set(
      crypt(true, key, iv(dataParams, le32(block)), bytes.subarray(start, start + 4096)),
      8 + start,
    );
  const hash = passwordHash(password, keyParams, spins),
    verifier = random(16);
  const field = (block: Uint8Array, value: Uint8Array) =>
    base64.encode(crypt(true, derivedKey(hash, keyParams, block), keyParams.salt, value));
  const hmacKey = random(64);
  const encryptedHmacKey = base64.encode(crypt(true, key, iv(dataParams, BLOCK.hmacKey), hmacKey));
  const encryptedHmacValue = base64.encode(
    crypt(true, key, iv(dataParams, BLOCK.hmacValue), hmac(dataParams.hash, hmacKey, encrypted)),
  );
  const attrs = (params: Parameters) =>
    `saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${base64.encode(params.salt)}"`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><keyData ${attrs(dataParams)}/><dataIntegrity encryptedHmacKey="${encryptedHmacKey}" encryptedHmacValue="${encryptedHmacValue}"/><keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><p:encryptedKey spinCount="${spins}" ${attrs(keyParams)} encryptedVerifierHashInput="${field(BLOCK.input, verifier)}" encryptedVerifierHashValue="${field(BLOCK.verifier, keyParams.hash(verifier))}" encryptedKeyValue="${field(BLOCK.key, key)}"/></keyEncryptor></keyEncryptors></encryption>`;
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "EncryptionInfo", concatBytes(PREFIX, utf8.decode(xml)));
  CFB.utils.cfb_add(container, "EncryptedPackage", encrypted);
  CFB.utils.cfb_del(container, "\u0001Sh33tJ5");
  key.fill(0);
  hash.fill(0);
  hmacKey.fill(0);
  return new Uint8Array(CFB.write(container, { type: "array", fileType: "cfb" }) as ArrayBuffer);
}
