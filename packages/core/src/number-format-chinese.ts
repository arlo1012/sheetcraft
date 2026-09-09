export type ChineseNativeNumber = Readonly<{
  digits: readonly string[];
  smallUnits: readonly string[];
  largeUnits: readonly string[];
}>;

export const CHINESE_LOWER: ChineseNativeNumber = {
  digits: ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
  smallUnits: ["", "十", "百", "千"],
  largeUnits: ["", "万", "亿", "兆"],
};

export const CHINESE_UPPER: ChineseNativeNumber = {
  digits: ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"],
  smallUnits: ["", "拾", "佰", "仟"],
  largeUnits: ["", "万", "亿", "兆"],
};

export function toChineseInteger(value: string, native: ChineseNativeNumber): string {
  if (!/^\d+$/.test(value)) return value;
  const normalized = value.replace(/^0+(?=\d)/, "");
  if (normalized === "0") return native.digits[0] ?? "0";
  const groups: string[] = [];
  for (let end = normalized.length; end > 0; end -= 4) {
    groups.unshift(normalized.slice(Math.max(0, end - 4), end));
  }
  let output = "";
  let needsZero = false;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group || /^0+$/.test(group)) {
      if (output) needsZero = true;
      continue;
    }
    if (
      output &&
      (needsZero || Number(group) < 1000) &&
      !output.endsWith(native.digits[0] ?? "零")
    ) {
      output += native.digits[0] ?? "零";
    }
    output += toChineseGroup(group, native);
    const largeUnit = native.largeUnits[groups.length - index - 1];
    if (largeUnit) output += largeUnit;
    needsZero = false;
  }
  return native === CHINESE_LOWER && normalized.length <= 2 && output.startsWith("一十")
    ? output.slice(1)
    : output;
}

function toChineseGroup(group: string, native: ChineseNativeNumber): string {
  let output = "";
  let needsZero = false;
  for (let index = 0; index < group.length; index += 1) {
    const digit = Number(group[index]);
    const unit = native.smallUnits[group.length - index - 1];
    if (digit === 0) {
      if (output) needsZero = true;
      continue;
    }
    if (needsZero && !output.endsWith(native.digits[0] ?? "零")) output += native.digits[0] ?? "零";
    output += `${native.digits[digit] ?? ""}${unit ?? ""}`;
    needsZero = false;
  }
  return output;
}
