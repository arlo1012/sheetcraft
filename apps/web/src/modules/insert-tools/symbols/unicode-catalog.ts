export type UnicodeRange<T = string> = readonly [start: number, end: number, value: T];
export type UnicodeCatalogData = Readonly<{
  version: string;
  blocks: readonly UnicodeRange[];
  categories: readonly UnicodeRange[];
  names: readonly UnicodeRange[];
  aliases: readonly (readonly [codePoint: number, alias: string, type: string])[];
}>;
export type UnicodeCharacter = Readonly<{
  codePoint: number;
  text: string;
  name: string | undefined;
  category: string;
  block: UnicodeRange | undefined;
  aliases: readonly Readonly<{ name: string; type: string }>[];
}>;
export type FontCoverageRange = readonly [start: number, end: number];
export type SymbolSubset = Readonly<{ name: string; start: number; end: number; count: number }>;

export function isUnicodeScalar(value: number): boolean {
  return (
    Number.isInteger(value) && value >= 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
  );
}

export function parseSymbolCharacterCode(
  input: string,
  format: "hex" | "decimal",
): number | undefined {
  const text = input.trim();
  const normalized = format === "hex" ? text.replace(/^(?:U\+|0x)/i, "") : text;
  if (!(format === "hex" ? /^[0-9a-f]{1,6}$/i : /^[0-9]{1,7}$/).test(normalized)) return undefined;
  const value = Number.parseInt(normalized, format === "hex" ? 16 : 10);
  return isUnicodeScalar(value) ? value : undefined;
}

export function symbolCharacterCode(codePoint: number, format: "hex" | "decimal" = "hex"): string {
  if (!isUnicodeScalar(codePoint)) throw new RangeError("Not a Unicode scalar");
  return format === "hex"
    ? codePoint.toString(16).toUpperCase().padStart(4, "0")
    : String(codePoint);
}

function findInterval<T>(
  ranges: readonly UnicodeRange<T>[],
  value: number,
): UnicodeRange<T> | undefined {
  let start = 0;
  let end = ranges.length - 1;
  while (start <= end) {
    const middle = (start + end) >>> 1;
    const entry = ranges[middle]!;
    if (value < entry[0]) end = middle - 1;
    else if (value > entry[1]) start = middle + 1;
    else return entry;
  }
  return undefined;
}

export function fontHasCodePoint(ranges: readonly FontCoverageRange[], codePoint: number): boolean {
  if (!isUnicodeScalar(codePoint)) return false;
  let start = 0;
  let end = ranges.length - 1;
  while (start <= end) {
    const middle = (start + end) >>> 1;
    const entry = ranges[middle]!;
    if (codePoint < entry[0]) end = middle - 1;
    else if (codePoint > entry[1]) start = middle + 1;
    else return true;
  }
  return false;
}

/** Official UCD semantics stay separate from a face's actual cmap repertoire. */
export class SymbolUnicodeCatalog {
  readonly version: string;
  readonly blocks: readonly UnicodeRange[];
  private readonly aliases = new Map<number, Array<Readonly<{ name: string; type: string }>>>();
  constructor(private readonly data: UnicodeCatalogData) {
    this.version = data.version;
    this.blocks = data.blocks;
    for (const [codePoint, name, type] of data.aliases) {
      const entries = this.aliases.get(codePoint) ?? [];
      entries.push({ name, type });
      this.aliases.set(codePoint, entries);
    }
  }
  category(codePoint: number): string {
    return findInterval(this.data.categories, codePoint)?.[2] ?? "Cn";
  }
  character(codePoint: number): UnicodeCharacter | undefined {
    if (!isUnicodeScalar(codePoint)) return undefined;
    const pattern = findInterval(this.data.names, codePoint)?.[2];
    return {
      codePoint,
      text: String.fromCodePoint(codePoint),
      name: pattern?.replace("*", symbolCharacterCode(codePoint)),
      category: this.category(codePoint),
      block: findInterval(this.blocks, codePoint),
      aliases: this.aliases.get(codePoint) ?? [],
    };
  }
  /** Controls/format characters have an explicit Special Characters presentation. */
  isBrowseCharacter(codePoint: number, includePrivateUse = false): boolean {
    if (!isUnicodeScalar(codePoint)) return false;
    const category = this.category(codePoint);
    return (
      category !== "Cc" &&
      category !== "Cf" &&
      category !== "Cn" &&
      (includePrivateUse || category !== "Co")
    );
  }
  codePoints(coverage?: readonly FontCoverageRange[]): Uint32Array {
    const values: number[] = [];
    const ranges = coverage ?? this.data.categories.map(([start, end]) => [start, end] as const);
    for (const [start, end] of ranges)
      for (let cp = start; cp <= end; cp++)
        if (this.isBrowseCharacter(cp, !!coverage)) values.push(cp);
    return Uint32Array.from(values);
  }
  subsets(points: Uint32Array): readonly SymbolSubset[] {
    const result: SymbolSubset[] = [];
    let index = 0;
    for (const [start, end, name] of this.blocks) {
      while (index < points.length && points[index]! < start) index++;
      const first = index;
      while (index < points.length && points[index]! <= end) index++;
      const count = index - first;
      if (count) result.push({ name, start, end, count });
    }
    return result;
  }
  matches(codePoint: number, query: string): boolean {
    const normalized = query.trim().toLocaleUpperCase("en-US");
    if (!normalized) return true;
    const character = this.character(codePoint);
    if (!character) return false;
    const hex = symbolCharacterCode(codePoint);
    return (
      character.text === query ||
      `U+${hex}`.includes(normalized) ||
      hex === normalized.replace(/^0X/, "") ||
      character.name?.includes(normalized) === true ||
      character.block?.[2].toLocaleUpperCase("en-US").includes(normalized) === true ||
      character.aliases.some((alias) => alias.name.toLocaleUpperCase("en-US").includes(normalized))
    );
  }
}

let catalogPromise: Promise<SymbolUnicodeCatalog> | undefined;
export function loadSymbolUnicodeCatalog(): Promise<SymbolUnicodeCatalog> {
  catalogPromise ??= fetch(new URL("./assets/unicode-catalog.json", import.meta.url).href)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unicode resource unavailable (${response.status})`);
      return new SymbolUnicodeCatalog((await response.json()) as UnicodeCatalogData);
    })
    .catch((error: unknown) => {
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
}
