import { isUnicodeScalar, type FontCoverageRange } from "./unicode-catalog";

export type FontCharacterCoverage =
  | Readonly<{
      status: "supported";
      ranges: readonly FontCoverageRange[];
      count: number;
      format: 4 | 12;
    }>
  | Readonly<{
      status: "unsupported";
      reason: "container" | "cmap" | "format" | "malformed" | "size";
    }>;

const MAX_FONT_BYTES = 64 * 1024 * 1024;
const MAX_UNICODE_POINTS = 0x110000;

/** Read one preferred Unicode cmap, not a union of conflicting subtables. */
export function readFontCharacterCoverage(bytes: ArrayBuffer | Uint8Array): FontCharacterCoverage {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.byteLength > MAX_FONT_BYTES) return { status: "unsupported", reason: "size" };
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
    if (input.byteLength < 12) return { status: "unsupported", reason: "malformed" };
    const signature = u32(0);
    if (signature !== 0x00010000 && signature !== 0x4f54544f && signature !== 0x74727565)
      return { status: "unsupported", reason: "container" };
    const tableCount = u16(4);
    bounds(12, tableCount * 16);
    const tables = new Map<number, { offset: number; length: number }>();
    for (let index = 0; index < tableCount; index++) {
      const position = 12 + index * 16;
      const tag = u32(position);
      const offset = u32(position + 8);
      const length = u32(position + 12);
      bounds(offset, length);
      if (tables.has(tag) || offset < 12 + tableCount * 16)
        throw new Error("Invalid font table directory");
      tables.set(tag, { offset, length });
    }
    const intervals = [...tables.values()]
      .filter((table) => table.length)
      .sort((a, b) => a.offset - b.offset);
    for (let index = 1; index < intervals.length; index++)
      if (intervals[index]!.offset < intervals[index - 1]!.offset + intervals[index - 1]!.length)
        throw new Error("Overlapping font tables");
    const cmap = tables.get(0x636d6170);
    const maxp = tables.get(0x6d617870);
    if (!cmap || !maxp) return { status: "unsupported", reason: "cmap" };
    if (maxp.length < 6 || cmap.length < 4) throw new Error("Truncated font table");
    const glyphCount = u16(maxp.offset + 4);
    if (!glyphCount || u16(cmap.offset) !== 0) throw new Error("Invalid cmap/maxp header");
    const cmapEnd = cmap.offset + cmap.length;
    const recordCount = u16(cmap.offset + 2);
    bounds(cmap.offset + 4, recordCount * 8, cmapEnd);
    const candidates: Array<{ offset: number; format: number; rank: number }> = [];
    for (let index = 0; index < recordCount; index++) {
      const record = cmap.offset + 4 + index * 8;
      const platform = u16(record);
      const encoding = u16(record + 2);
      if (
        !(
          (platform === 0 && encoding !== 5) ||
          (platform === 3 && (encoding === 1 || encoding === 10))
        )
      )
        continue;
      const offset = cmap.offset + u32(record + 4);
      bounds(offset, 2, cmapEnd);
      if (offset < cmap.offset + 4 + recordCount * 8)
        throw new Error("cmap subtable overlaps records");
      const format = u16(offset);
      if (format === 14) continue;
      const fullUnicode = [8, 10, 12, 13].includes(format);
      candidates.push({
        offset,
        format,
        rank:
          (fullUnicode ? 100 : 0) +
          (platform === 3 && encoding === 10 ? 30 : platform === 0 ? 20 : 10),
      });
    }
    candidates.sort((a, b) => b.rank - a.rank);
    const selected = candidates[0];
    if (!selected) return { status: "unsupported", reason: "cmap" };
    if (selected.format !== 4 && selected.format !== 12)
      return { status: "unsupported", reason: "format" };
    const ranges: Array<[number, number]> = [];
    let count = 0;
    function add(cp: number, glyph: number): void {
      if (glyph >= glyphCount) throw new Error("cmap references nonexistent glyph");
      if (!glyph || !isUnicodeScalar(cp)) return;
      if (++count > MAX_UNICODE_POINTS) throw new Error("Unbounded cmap repertoire");
      const previous = ranges.at(-1);
      if (previous && previous[1] + 1 === cp) previous[1] = cp;
      else ranges.push([cp, cp]);
    }
    const base = selected.offset;
    if (selected.format === 12) {
      bounds(base, 16, cmapEnd);
      if (u16(base + 2) !== 0) throw new Error("Invalid format12 reserved field");
      const length = u32(base + 4);
      const groups = u32(base + 12);
      if (length < 16 || groups > MAX_UNICODE_POINTS || 16 + groups * 12 > length)
        throw new Error("Invalid format12 groups");
      bounds(base, length, cmapEnd);
      let previous = -1;
      for (let index = 0; index < groups; index++) {
        const position = base + 16 + index * 12;
        const start = u32(position);
        const end = u32(position + 4);
        const firstGlyph = u32(position + 8);
        if (
          start > end ||
          start <= previous ||
          end > 0x10ffff ||
          firstGlyph + end - start >= glyphCount
        )
          throw new Error("Invalid format12 group");
        for (let cp = start; cp <= end; cp++) add(cp, firstGlyph + cp - start);
        previous = end;
      }
    } else {
      bounds(base, 16, cmapEnd);
      const length = u16(base + 2);
      const segmentCountX2 = u16(base + 6);
      if (!segmentCountX2 || segmentCountX2 % 2) throw new Error("Invalid format4 segment count");
      const segments = segmentCountX2 / 2;
      const minimum = 16 + segments * 8;
      if (length < minimum) throw new Error("Truncated format4 segments");
      bounds(base, length, cmapEnd);
      const endCodes = base + 14;
      const startCodes = base + 16 + segments * 2;
      const deltas = base + 16 + segments * 4;
      const rangeOffsets = base + 16 + segments * 6;
      if (u16(base + 14 + segments * 2) !== 0) throw new Error("Invalid format4 reserved field");
      if (u16(startCodes + (segments - 1) * 2) !== 0xffff)
        throw new Error("Invalid format4 sentinel");
      let previous = -1;
      for (let index = 0; index < segments; index++) {
        const start = u16(startCodes + index * 2);
        const end = u16(endCodes + index * 2);
        const delta = view.getInt16(deltas + index * 2);
        const offsetPosition = rangeOffsets + index * 2;
        const offset = u16(offsetPosition);
        if (start > end || start <= previous || offset % 2)
          throw new Error("Invalid format4 segment");
        for (let cp = start; cp <= end; cp++) {
          let glyph = (cp + delta) & 0xffff;
          if (offset) {
            const position = offsetPosition + offset + (cp - start) * 2;
            if (position < base + minimum) throw new Error("Invalid format4 glyph pointer");
            bounds(position, 2, base + length);
            glyph = u16(position);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          add(cp, glyph);
        }
        previous = end;
      }
      if (previous !== 0xffff) throw new Error("Missing format4 sentinel");
    }
    return { status: "supported", ranges, count, format: selected.format };
  } catch {
    return { status: "unsupported", reason: "malformed" };
  }
}
