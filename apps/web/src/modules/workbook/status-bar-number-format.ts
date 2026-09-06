import type { StatusBarNumberFormat } from "./composables/useStatusBarSettings";

const MAXIMUM_FRACTION_DIGITS = 6;
const CHINESE_GROUP_UNITS = [
  "",
  "万",
  "亿",
  "兆",
  "京",
  "垓",
  "秭",
  "穰",
  "沟",
  "涧",
  "正",
  "载",
] as const;

function normalize(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function groupEveryFour(integer: string, separator: string): string {
  const firstGroupLength = integer.length % 4 || 4;
  const groups = [integer.slice(0, firstGroupLength)];
  for (let start = firstGroupLength; start < integer.length; start += 4) {
    groups.push(integer.slice(start, start + 4));
  }
  return groups.join(separator);
}

function formatChineseUnits(integer: string): string {
  const firstGroupLength = integer.length % 4 || 4;
  const groups = [integer.slice(0, firstGroupLength)];
  for (let start = firstGroupLength; start < integer.length; start += 4) {
    groups.push(integer.slice(start, start + 4));
  }
  if (groups.length > CHINESE_GROUP_UNITS.length) {
    return groupEveryFour(integer, ",");
  }
  return groups
    .map((group, index) => group + CHINESE_GROUP_UNITS[groups.length - index - 1])
    .join("");
}

export function formatStatusBarNumber(
  value: number,
  locale: string,
  format: StatusBarNumberFormat,
): string {
  const normalized = normalize(value);
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: MAXIMUM_FRACTION_DIGITS,
    useGrouping: false,
  });
  if (!Number.isFinite(normalized)) {
    return formatter.format(normalized);
  }
  const parts = formatter.formatToParts(normalized);
  const integer = parts
    .filter((part) => part.type === "integer")
    .map((part) => part.value)
    .join("");
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? "";
  const fraction = parts.find((part) => part.type === "fraction")?.value ?? "";
  const sign = parts
    .filter((part) => part.type === "minusSign" || part.type === "plusSign")
    .map((part) => part.value)
    .join("");
  const suffix = `${decimal}${fraction}`;

  if (format === "none") {
    return `${sign}${integer}${suffix}`;
  }
  if (format === "thousands") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: MAXIMUM_FRACTION_DIGITS }).format(
      normalized,
    );
  }
  if (format === "ten-thousands") {
    return `${sign}${groupEveryFour(integer, ",")}${suffix}`;
  }
  return `${sign}${formatChineseUnits(integer)}${suffix}`;
}
