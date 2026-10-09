const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
export function columnNumber(label: string): number {
  let column = 0;
  for (const letter of label.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  return column;
}
export function columnName(column: number): string {
  let name = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}
export function cellPosition(reference: string): { row: number; column: number } {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(reference);
  const row = Number(match?.[2]);
  const column = columnNumber(match?.[1] ?? "");
  if (!match || !Number.isSafeInteger(row) || row > MAX_ROWS || column < 1 || column > MAX_COLUMNS)
    throw new Error(`Invalid XLSX cell reference: ${reference}`);
  return { row, column };
}

function sheetNameEnd(formula: string, start: number): number | undefined {
  if (formula[start] === "'") {
    for (let offset = start + 1; offset < formula.length; offset++) {
      if (formula[offset] !== "'") continue;
      if (formula[offset + 1] === "'") offset++;
      else return offset + 1;
    }
    return undefined;
  }
  const character = /[\w.$\u0080-\uFFFF]/;
  if (!character.test(formula[start] ?? "")) return undefined;
  let offset = start + 1;
  while (offset < formula.length && character.test(formula[offset]!)) offset++;
  return offset;
}

/** Translate A1 shared formulas without interpreting function or defined-name semantics. */
export function translateSharedFormula(formula: string, rows: number, columns: number): string {
  // Scan protected literals and brackets once. A regex that searches for the
  // closing bracket from every opening bracket is quadratic on malformed input.
  const tokens =
    /(?<![\w.])(?:(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)|(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})|(\$?)([1-9]\d*):(\$?)([1-9]\d*))(?![\w.(]|!)/gi;
  const translate = (source: string): string =>
    source.replace(
      tokens,
      (
        token,
        ca: string,
        col: string,
        ra: string,
        row: string,
        a1: string,
        c1: string,
        a2: string,
        c2: string,
        b1: string,
        r1: string,
        b2: string,
        r2: string,
      ) => {
        if (col) {
          const originalColumn = columnNumber(col);
          if (originalColumn > MAX_COLUMNS || Number(row) > MAX_ROWS) return token;
          const nextColumn = originalColumn + (ca ? 0 : columns);
          const nextRow = Number(row) + (ra ? 0 : rows);
          return nextColumn < 1 || nextColumn > MAX_COLUMNS || nextRow < 1 || nextRow > MAX_ROWS
            ? "#REF!"
            : `${ca}${columnName(nextColumn)}${ra}${nextRow}`;
        }
        if (c1) {
          const left = columnNumber(c1) + (a1 ? 0 : columns);
          const right = columnNumber(c2) + (a2 ? 0 : columns);
          return left < 1 || right < 1 || left > MAX_COLUMNS || right > MAX_COLUMNS
            ? "#REF!"
            : `${a1}${columnName(left)}:${a2}${columnName(right)}`;
        }
        if (r1) {
          const top = Number(r1) + (b1 ? 0 : rows),
            bottom = Number(r2) + (b2 ? 0 : rows);
          return top < 1 || bottom < 1 || top > MAX_ROWS || bottom > MAX_ROWS
            ? "#REF!"
            : `${b1}${top}:${b2}${bottom}`;
        }
        return token;
      },
    );
  const parts: string[] = [];
  let start = 0;
  let offset = 0;
  while (offset < formula.length) {
    const character = formula[offset];
    const nameEnd = sheetNameEnd(formula, offset);
    const qualifierEnd =
      nameEnd !== undefined && formula[nameEnd] === ":"
        ? sheetNameEnd(formula, nameEnd + 1)
        : nameEnd;
    if (qualifierEnd !== undefined && formula[qualifierEnd] === "!") {
      // Protect the entire qualifier, including cell-like 3D sheet names and
      // quoted/unquoted mixes. Only references after the bang are translated.
      parts.push(translate(formula.slice(start, offset)));
      parts.push(formula.slice(offset, qualifierEnd + 1));
      offset = qualifierEnd + 1;
      start = offset;
      continue;
    }
    if (character !== '"' && character !== "'" && character !== "[") {
      offset = nameEnd ?? offset + 1;
      continue;
    }
    parts.push(translate(formula.slice(start, offset)));
    const protectedStart = offset++;
    if (character === "[") {
      let depth = 1;
      while (offset < formula.length && depth) {
        const current = formula[offset++];
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
    parts.push(formula.slice(protectedStart, offset));
    start = offset;
  }
  parts.push(translate(formula.slice(start)));
  return parts.join("");
}
