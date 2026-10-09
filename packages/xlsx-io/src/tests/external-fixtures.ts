import { readFile } from "node:fs/promises";

/** Frozen independent inputs: see fixtures/external/README.md for provenance and hashes. */
export async function readExternalFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(new URL(`./fixtures/external/${name}.xlsx`, import.meta.url)),
  );
}
