import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import coverage from "../../../modules/insert-tools/symbols/assets/font-coverage.json";
import { readLocalFontNames } from "../../../shared/cell-text/local-font-names";

type NameRecord = {
  id: number;
  text: string;
  platform?: number;
  encoding?: number;
  language?: number;
};
function nameFont(
  records: readonly NameRecord[],
  languageTags: readonly string[] = [],
): Uint8Array {
  const strings = [...records.map((record) => record.text), ...languageTags];
  const header = 6 + records.length * 12 + (languageTags.length ? 2 + languageTags.length * 4 : 0);
  const length = header + strings.reduce((total, text) => total + text.length * 2, 0);
  const bytes = new Uint8Array(28 + length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(12, 0x6e616d65);
  view.setUint32(20, 28);
  view.setUint32(24, length);
  view.setUint16(28, languageTags.length ? 1 : 0);
  view.setUint16(30, records.length);
  view.setUint16(32, header);
  let offset = 0;
  strings.forEach((text, index) => {
    if (index < records.length) {
      const record = records[index]!;
      const at = 34 + index * 12;
      view.setUint16(at, record.platform ?? 3);
      view.setUint16(at + 2, record.encoding ?? 1);
      view.setUint16(at + 4, record.language ?? 0x0409);
      view.setUint16(at + 6, record.id);
      view.setUint16(at + 8, text.length * 2);
      view.setUint16(at + 10, offset);
    } else {
      const start = 34 + records.length * 12;
      view.setUint16(start, languageTags.length);
      const at = start + 2 + (index - records.length) * 4;
      view.setUint16(at, text.length * 2);
      view.setUint16(at + 2, offset);
    }
    for (let character = 0; character < text.length; character++)
      view.setUint16(28 + header + offset + character * 2, text.charCodeAt(character));
    offset += text.length * 2;
  });
  return bytes;
}

describe("verified local SFNT names", () => {
  test.each(coverage)(
    "reads the actual $family name from the public bundled face",
    async (font) => {
      const bytes = await readFile(resolve("src/shared/cell-text/fonts", font.filename));
      const result = readLocalFontNames(bytes);
      expect(result.status).toBe("supported");
      if (result.status === "supported") {
        expect(result.names.family).toBe(font.family);
        expect(result.names.familyNames).toContain(font.family);
        expect(result.names.postscriptNames.length).toBeGreaterThan(0);
      }
    },
  );

  test("prefers the typographic name and verified Unicode records over legacy encodings", () => {
    expect(
      readLocalFontNames(
        nameFont([
          { id: 1, text: "Legacy", platform: 1, encoding: 0, language: 0 },
          { id: 1, text: "Style Linked" },
          { id: 16, text: "符号 Ω", platform: 0, encoding: 4, language: 0 },
          { id: 4, text: "符号 Ω Regular" },
          { id: 6, text: "SymbolsOmega-Regular" },
        ]),
      ),
    ).toMatchObject({
      status: "supported",
      names: { family: "符号 Ω", postscriptNames: ["SymbolsOmega-Regular"] },
    });
  });

  test("reads name format1 language tags and prefers verified English metadata", () => {
    expect(
      readLocalFontNames(
        nameFont(
          [
            { id: 16, text: "符号", language: 0x8000 },
            { id: 16, text: "Symbols", language: 0x8001 },
          ],
          ["zh-Hans", "en-US"],
        ),
      ),
    ).toMatchObject({ status: "supported", names: { family: "Symbols" } });
  });

  test("handles offset Uint8Array views and supplementary Unicode family names", () => {
    const bytes = nameFont([{ id: 1, text: "Family 𐀀" }]);
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 4);
    expect(readLocalFontNames(padded.subarray(4, bytes.length + 4))).toMatchObject({
      status: "supported",
      names: { family: "Family 𐀀" },
    });
  });

  test.each(["Family\u0000", " Family", "Family ", "\ud800", "F".repeat(257)])(
    "rejects invalid name text %#",
    (text) => {
      expect(readLocalFontNames(nameFont([{ id: 1, text }]))).toEqual({
        status: "unsupported",
        reason: "malformed",
      });
    },
  );

  test("never guesses an unsupported legacy name or unknown name format", () => {
    expect(readLocalFontNames(nameFont([{ id: 1, text: "Legacy", platform: 1 }]))).toEqual({
      status: "unsupported",
      reason: "name",
    });
    const unknown = nameFont([{ id: 1, text: "Family" }]);
    new DataView(unknown.buffer).setUint16(28, 2);
    expect(readLocalFontNames(unknown)).toEqual({ status: "unsupported", reason: "name" });
  });

  test("rejects invalid table/name bounds, duplicate records and language references", () => {
    const truncated = nameFont([{ id: 1, text: "Family" }]);
    expect(readLocalFontNames(truncated.subarray(0, truncated.length - 1))).toEqual({
      status: "unsupported",
      reason: "malformed",
    });
    const offset = nameFont([{ id: 1, text: "Family" }]);
    new DataView(offset.buffer).setUint16(44, 0xffff);
    expect(readLocalFontNames(offset)).toEqual({ status: "unsupported", reason: "malformed" });
    expect(
      readLocalFontNames(
        nameFont([
          { id: 1, text: "A" },
          { id: 1, text: "B" },
        ]),
      ),
    ).toEqual({ status: "unsupported", reason: "malformed" });
    expect(
      readLocalFontNames(nameFont([{ id: 1, text: "Family", language: 0x8001 }], ["en"])),
    ).toEqual({ status: "unsupported", reason: "malformed" });
  });

  test("rejects other containers and invalid PostScript names rather than repairing them", () => {
    const bytes = nameFont([{ id: 1, text: "Family" }]);
    for (const tag of [0x774f4646, 0x774f4632, 0x74746366]) {
      new DataView(bytes.buffer).setUint32(0, tag);
      expect(readLocalFontNames(bytes)).toEqual({ status: "unsupported", reason: "container" });
    }
    expect(
      readLocalFontNames(
        nameFont([
          { id: 1, text: "Family" },
          { id: 6, text: "Bad Name" },
        ]),
      ),
    ).toEqual({ status: "unsupported", reason: "malformed" });
  });
});
