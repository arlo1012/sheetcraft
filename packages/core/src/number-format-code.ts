import { format } from "numfmt";

const UNSUPPORTED_NATIVE_NUMBER_PATTERN = /\[(?:NatNum|DBNum(?![12]\]))/i;

export function canonicalizeCellNumberFormatCode(code: string): string {
  const aliases: Readonly<Record<string, string>> = {
    "[黑色]": "[Black]",
    "[蓝色]": "[Blue]",
    "[青色]": "[Cyan]",
    "[绿色]": "[Green]",
    "[洋红]": "[Magenta]",
    "[红色]": "[Red]",
    "[白色]": "[White]",
    "[黄色]": "[Yellow]",
    "g/通用格式": "General",
    通用格式: "General",
  };
  let output = "";
  let quoted = false;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? "";
    if (character === "\\") {
      output += character + (code[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (character === '"') {
      if (quoted && code[index + 1] === '"') {
        output += '""';
        index += 1;
      } else {
        quoted = !quoted;
        output += character;
      }
      continue;
    }
    if (!quoted) {
      const alias = Object.keys(aliases).find(
        (candidate) => code.slice(index, index + candidate.length).toLowerCase() === candidate,
      );
      if (alias) {
        output += aliases[alias] ?? alias;
        index += alias.length - 1;
        continue;
      }
    }
    output += character;
  }
  return output;
}

export function validateCellNumberFormatCode(code: string): boolean {
  if (typeof code !== "string" || !code.trim() || code.length > 255) return false;
  if (
    [...code].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    UNSUPPORTED_NATIVE_NUMBER_PATTERN.test(code)
  )
    return false;
  const canonical = canonicalizeCellNumberFormatCode(code);
  if (!hasAtMostOneDbNumPerSection(canonical)) return false;
  try {
    format(canonical, 1234.5, { locale: "en-US", throws: true });
    return true;
  } catch {
    return false;
  }
}

function hasAtMostOneDbNumPerSection(code: string): boolean {
  let quoted = false;
  let count = 0;
  let sections = 1;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] ?? "";
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === ";") {
      if (count > 1) return false;
      count = 0;
      sections += 1;
      if (sections > 4) return false;
      continue;
    }
    if (!quoted && /^\[DBNum[0-9]+\]/i.test(code.slice(index))) count += 1;
  }
  return count <= 1;
}
