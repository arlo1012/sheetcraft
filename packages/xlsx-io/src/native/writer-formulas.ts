// MS-XLSX 2.2.3 lists these Core-supported functions with an _xlfn. prefix.
// FILTER and SORT also carry the worksheet-only _xlws. namespace. Do not infer
// prefixes for unknown functions or for unprefixed exceptions such as ISO.CEILING.
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/5d1b6d44-6fc1-4ecd-8fef-0b27406cc2bf
const FUTURE_FUNCTIONS = new Set([
  "AGGREGATE",
  "BITAND",
  "BITLSHIFT",
  "BITOR",
  "BITRSHIFT",
  "BITXOR",
  "CEILING.MATH",
  "CHOOSECOLS",
  "CHOOSEROWS",
  "CONCAT",
  "DAYS",
  "DROP",
  "FLOOR.MATH",
  "HSTACK",
  "IFNA",
  "IFS",
  "ISOWEEKNUM",
  "MODE.SNGL",
  "NUMBERVALUE",
  "PERCENTILE.EXC",
  "PERCENTILE.INC",
  "PERCENTRANK.EXC",
  "PERCENTRANK.INC",
  "QUARTILE.EXC",
  "QUARTILE.INC",
  "RANK.AVG",
  "RANK.EQ",
  "SEQUENCE",
  "STDEV.P",
  "STDEV.S",
  "SWITCH",
  "TAKE",
  "TEXTAFTER",
  "TEXTBEFORE",
  "TEXTJOIN",
  "UNICHAR",
  "UNICODE",
  "UNIQUE",
  "VAR.P",
  "VAR.S",
  "VSTACK",
  "XLOOKUP",
  "XOR",
]);
const WORKSHEET_FUNCTIONS = new Set(["FILTER", "SORT"]);
const NAME_CHARACTER = /[\p{L}\p{N}\p{M}_.$\\?]/u;

function characterAt(source: string, offset: number): string {
  return String.fromCodePoint(source.codePointAt(offset)!);
}

/** Add OOXML function markers without changing literal, reference or name text. */
export function xlsxFormula(source: string): string {
  const formula = source.startsWith("=") ? source.slice(1) : source;
  const parts: string[] = [];
  let offset = 0;
  let start = 0;
  let previous = "";
  while (offset < formula.length) {
    const character = characterAt(formula, offset);
    if (character === '"' || character === "'" || character === "[") {
      offset += character.length;
      if (character === "[") {
        let depth = 1;
        while (offset < formula.length && depth) {
          const current = formula[offset++]!;
          // Structured-reference headers escape literal brackets with an apostrophe.
          if (current === "'" && (formula[offset] === "[" || formula[offset] === "]")) offset++;
          else if (current === "[") depth++;
          else if (current === "]") depth--;
        }
      } else {
        while (offset < formula.length) {
          if (formula[offset++] !== character) continue;
          if (formula[offset] === character) offset++;
          else break;
        }
      }
      previous = formula[offset - 1]!;
      continue;
    }
    if (!NAME_CHARACTER.test(character)) {
      if (!/\s/.test(character)) previous = character;
      offset += character.length;
      continue;
    }
    const nameStart = offset;
    offset += character.length;
    while (offset < formula.length) {
      const nextCharacter = characterAt(formula, offset);
      if (!NAME_CHARACTER.test(nextCharacter)) break;
      offset += nextCharacter.length;
    }
    const name = formula.slice(nameStart, offset);
    const canonical = name.toUpperCase();
    let next = offset;
    while (next < formula.length && /\s/.test(formula[next]!)) next++;
    // Qualified calls may be user-defined names. Existing function namespaces are
    // part of the scanned name, so an already-prefixed call stays byte-for-byte.
    if (formula[next] === "(" && previous !== "!" && previous !== "]") {
      const prefix = WORKSHEET_FUNCTIONS.has(canonical)
        ? "_xlfn._xlws."
        : FUTURE_FUNCTIONS.has(canonical)
          ? "_xlfn."
          : "";
      if (prefix) {
        parts.push(formula.slice(start, nameStart), prefix);
        start = nameStart;
      }
    }
    previous = formula[offset - 1]!;
  }
  parts.push(formula.slice(start));
  return parts.join("");
}
