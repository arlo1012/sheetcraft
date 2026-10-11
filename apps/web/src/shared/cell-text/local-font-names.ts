import { LOCAL_FONT_MAX_BYTES } from "./local-font-errors";

export type LocalFontNames = Readonly<{
  family: string;
  familyNames: readonly string[];
  postscriptNames: readonly string[];
  fullName?: string;
  style?: string;
}>;
export type LocalFontNameResult =
  | Readonly<{ status: "supported"; names: LocalFontNames }>
  | Readonly<{ status: "unsupported"; reason: "size" | "container" | "malformed" | "name" }>;

/** OpenType name versions 0/1. Unsupported legacy encodings are never guessed.
 * https://learn.microsoft.com/en-us/typography/opentype/spec/name
 */
export function readLocalFontNames(bytes: ArrayBuffer | Uint8Array): LocalFontNameResult {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.byteLength > LOCAL_FONT_MAX_BYTES) return { status: "unsupported", reason: "size" };
  try {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    function bounds(offset: number, length: number, end = view.byteLength): void {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset + length > end
      )
        throw new Error("Invalid font bounds");
    }
    const u16 = (offset: number) => {
      bounds(offset, 2);
      return view.getUint16(offset);
    };
    const u32 = (offset: number) => {
      bounds(offset, 4);
      return view.getUint32(offset);
    };
    if (input.length < 12) return { status: "unsupported", reason: "malformed" };
    if (![0x00010000, 0x4f54544f, 0x74727565].includes(u32(0)))
      return { status: "unsupported", reason: "container" };
    const count = u16(4);
    const directoryEnd = 12 + count * 16;
    bounds(12, count * 16);
    const tables = new Map<number, { offset: number; length: number }>();
    for (let index = 0; index < count; index++) {
      const entry = 12 + index * 16;
      const tag = u32(entry);
      const table = { offset: u32(entry + 8), length: u32(entry + 12) };
      bounds(table.offset, table.length);
      if (tables.has(tag) || table.offset < directoryEnd) throw new Error("Invalid directory");
      tables.set(tag, table);
    }
    const ordered = [...tables.values()]
      .filter((table) => table.length)
      .sort((a, b) => a.offset - b.offset);
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index]!.offset < ordered[index - 1]!.offset + ordered[index - 1]!.length)
        throw new Error("Overlapping font tables");
    }
    const table = tables.get(0x6e616d65);
    if (!table) return { status: "unsupported", reason: "name" };
    const end = table.offset + table.length;
    bounds(table.offset, 6, end);
    const format = u16(table.offset);
    if (format !== 0 && format !== 1) return { status: "unsupported", reason: "name" };
    const records = u16(table.offset + 2);
    const recordEnd = table.offset + 6 + records * 12;
    bounds(table.offset + 6, records * 12, end);
    const storage = table.offset + u16(table.offset + 4);
    let headerEnd = recordEnd;
    const languageTags: string[] = [];
    function decode(offset: number, length: number, maxCharacters: number): string {
      bounds(offset, length, end);
      if (offset < storage || length % 2 || length > maxCharacters * 4)
        throw new Error("Invalid Unicode name record");
      let text = "";
      for (let position = offset; position < offset + length; position += 2)
        text += String.fromCharCode(u16(position));
      if (
        !text ||
        [...text].length > maxCharacters ||
        text.trim() !== text ||
        [...text].some((character) => {
          const point = character.codePointAt(0)!;
          return (
            point < 32 || (point >= 127 && point <= 159) || (point >= 0xd800 && point <= 0xdfff)
          );
        })
      )
        throw new Error("Invalid Unicode name text");
      return text;
    }
    if (format === 1) {
      bounds(recordEnd, 2, end);
      const tagCount = u16(recordEnd);
      headerEnd += 2 + tagCount * 4;
      bounds(recordEnd + 2, tagCount * 4, end);
      if (storage < headerEnd || storage > end) throw new Error("Invalid name storage");
      for (let index = 0; index < tagCount; index++) {
        const position = recordEnd + 2 + index * 4;
        const tag = decode(storage + u16(position + 2), u16(position), 63);
        if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(tag))
          throw new Error("Invalid language tag");
        languageTags.push(tag);
      }
    }
    if (storage < headerEnd || storage > end) throw new Error("Invalid name storage");
    const entries: Array<{ id: number; value: string; rank: number }> = [];
    const keys = new Set<string>();
    for (let index = 0; index < records; index++) {
      const position = table.offset + 6 + index * 12;
      const platform = u16(position);
      const encoding = u16(position + 2);
      const language = u16(position + 4);
      const id = u16(position + 6);
      const length = u16(position + 8);
      const offset = storage + u16(position + 10);
      bounds(offset, length, end);
      const key = `${platform}:${encoding}:${language}:${id}`;
      if (keys.has(key)) throw new Error("Duplicate name record");
      keys.add(key);
      const tag = language >= 0x8000 ? languageTags[language - 0x8000] : undefined;
      if (language >= 0x8000 && !tag) throw new Error("Invalid name language");
      if (
        ![1, 2, 4, 6, 16, 17].includes(id) ||
        !((platform === 0 && encoding <= 6) || (platform === 3 && [0, 1, 10].includes(encoding)))
      )
        continue;
      const value = decode(offset, length, 256);
      if (
        id === 6 &&
        (value.length > 63 ||
          !/^[\x21-\x7e]+$/.test(value) ||
          [...value].some((character) => "[](){}<>/%".includes(character)))
      )
        throw new Error("Invalid PostScript name");
      const english = tag ? /^en(?:-|$)/i.test(tag) : platform === 3 && language === 0x0409;
      entries.push({ id, value, rank: (english ? 100 : 0) + (platform === 0 ? 20 : 10) });
    }
    entries.sort((a, b) => b.rank - a.rank);
    const find = (id: number) => entries.find((entry) => entry.id === id)?.value;
    const family = find(16) ?? find(1);
    if (!family) return { status: "unsupported", reason: "name" };
    const fullName = find(4);
    const style = find(17) ?? find(2);
    return {
      status: "supported",
      names: {
        family,
        familyNames: [
          ...new Set(
            entries
              .filter((entry) => entry.id === 1 || entry.id === 16)
              .map((entry) => entry.value),
          ),
        ],
        postscriptNames: [
          ...new Set(entries.filter((entry) => entry.id === 6).map((entry) => entry.value)),
        ],
        ...(fullName ? { fullName } : {}),
        ...(style ? { style } : {}),
      },
    };
  } catch {
    return { status: "unsupported", reason: "malformed" };
  }
}
