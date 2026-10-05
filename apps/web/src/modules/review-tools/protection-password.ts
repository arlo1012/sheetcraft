import { createProtectionPassword, type ProtectionPassword } from "@idea10/core";

/** Uses browser randomness without requiring SubtleCrypto or sending the password elsewhere. */
export function createBrowserProtectionPassword(password: string): ProtectionPassword | undefined {
  return password
    ? createProtectionPassword(password, crypto.getRandomValues(new Uint8Array(16)))
    : undefined;
}
