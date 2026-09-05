import type { CellNumberFormat } from "@idea10/core/style";

function decimalFormat(fractionDigits: number): string {
  return `#,##0${fractionDigits ? `.${"0".repeat(fractionDigits)}` : ""}`;
}

export function toExcelNumberFormat(format: CellNumberFormat): string {
  const value = decimalFormat(format.fractionDigits);
  if (format.kind === "number") return value;
  if (format.kind === "percent") return `${value}%`;
  if (format.kind === "currency") return `[$${format.currency}]${value}`;
  return value;
}

/** `null` represents Excel's no-op General format; `undefined` is unsupported. */
export function fromExcelNumberFormat(value: unknown): CellNumberFormat | null | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim().toLowerCase() === "general") return null;
  const match = /^(?:\[\$([A-Z]{3})\])?(?:#,##0|0)(?:\.(0{1,20}))?(%)?$/i.exec(value);
  if (!match) return undefined;
  const fractionDigits = (match[2] ?? "").length;
  if (match[1] && match[3]) return undefined;
  if (match[1]) return { kind: "currency", currency: match[1].toUpperCase(), fractionDigits };
  if (match[3]) return { kind: "percent", fractionDigits };
  return { kind: "number", fractionDigits };
}
