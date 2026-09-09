import { CHINESE_UPPER, toChineseInteger } from "./number-format-chinese.js";

/**
 * Renders the numeric part of WPS's Special > RMB uppercase code.  Section
 * selection, prefixes, suffixes and colors remain the formatter's job.
 */
export function formatWpsRmbUppercase(value: number): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  const cents = Math.round(shiftDecimal(Math.abs(value), 2));
  if (!Number.isSafeInteger(cents)) return "#NUM!";
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;
  let text: string;
  if (cents === 0) {
    text = "零元整";
  } else {
    const parts: string[] = [];
    if (yuan > 0) parts.push(`${toChineseInteger(String(yuan), CHINESE_UPPER)}元`);
    if (jiao > 0) parts.push(`${CHINESE_UPPER.digits[jiao]}角`);
    if (fen > 0) {
      if (yuan > 0 && jiao === 0) parts.push("零");
      parts.push(`${CHINESE_UPPER.digits[fen]}分`);
    }
    if (jiao === 0 && fen === 0) parts.push("整");
    text = parts.join("");
  }
  return `${value < 0 && cents !== 0 ? "负" : ""}${text}`;
}

function shiftDecimal(value: number, exponent: number): number {
  const [coefficient, existingExponent = "0"] = `${value}e`.split("e");
  return Number(`${coefficient}e${Number(existingExponent) + exponent}`);
}
