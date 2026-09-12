import { isFormulaError, type FormulaValue } from "../types.js";
import { formatCellNumberValue } from "../../number-format.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionContext,
  FormulaFunctionDefinition,
} from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar, values } from "./helpers.js";

function direct(context: FormulaFunctionContext, index: number): FormulaValue {
  return scalar(context.evaluateArgument(index));
}

function text(value: FormulaValue): string | ReturnType<typeof formulaError> {
  if (isFormulaError(value)) return value;
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : formulaError("VALUE");
  return value;
}

function count(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  const value = finiteNumber(direct(context, index));
  if (isFormulaError(value)) return value;
  return Math.trunc(value);
}

function joinValues(
  argument: FormulaFunctionArgument,
  ignoreEmpty: boolean,
): string | ReturnType<typeof formulaError> {
  const source = values(argument);
  let result = "";
  for (const value of source) {
    const next = text(value);
    if (isFormulaError(next)) return next;
    if (!ignoreEmpty || next !== "") result += `${result === "" ? "" : "\u0000"}${next}`;
  }
  return result;
}

function textJoin(context: FormulaFunctionContext): FormulaValue {
  const delimiter = text(direct(context, 0));
  if (isFormulaError(delimiter)) return delimiter;
  const ignore = direct(context, 1);
  if (isFormulaError(ignore) || typeof ignore !== "boolean") return formulaError("VALUE");
  const items: string[] = [];
  for (let index = 2; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    const source = values(argument);
    for (const item of source) {
      const value = text(item);
      if (isFormulaError(value)) return value;
      if (!ignore || value !== "") items.push(value);
    }
  }
  return items.join(delimiter);
}

function numberValue(context: FormulaFunctionContext): FormulaValue {
  const source = text(direct(context, 0));
  const decimal = context.argumentCount > 1 ? text(direct(context, 1)) : ".";
  const group = context.argumentCount > 2 ? text(direct(context, 2)) : ",";
  if (isFormulaError(source) || isFormulaError(decimal) || isFormulaError(group))
    return isFormulaError(source) ? source : isFormulaError(decimal) ? decimal : group;
  if (decimal.length !== 1 || group.length > 1 || decimal === group) return formulaError("VALUE");
  const trimmed = source.trim();
  if (trimmed === "") return formulaError("VALUE");
  const normalized = group === "" ? trimmed : trimmed.split(group).join("");
  const expression = decimal === "." ? normalized : normalized.split(decimal).join(".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(expression))
    return formulaError("VALUE");
  const result = Number(expression);
  return Number.isFinite(result) ? result : formulaError("VALUE");
}

function fixedText(context: FormulaFunctionContext, currency: boolean): FormulaValue {
  const value = finiteNumber(direct(context, 0));
  const decimals = context.argumentCount > 1 ? count(context, 1) : 2;
  const noCommas = !currency && context.argumentCount > 2 ? direct(context, 2) : false;
  if (isFormulaError(value) || isFormulaError(decimals) || isFormulaError(noCommas))
    return isFormulaError(value) ? value : isFormulaError(decimals) ? decimals : noCommas;
  if (typeof noCommas !== "boolean" || decimals < -127 || decimals > 127)
    return formulaError("VALUE");
  const precision = Math.max(0, decimals);
  const scale = 10 ** precision;
  const rounded =
    decimals < 0
      ? Math.sign(value) * Math.round(Math.abs(value) / 10 ** -decimals) * 10 ** -decimals
      : (Math.sign(value) * Math.round(Math.abs(value) * scale)) / scale;
  if (!Number.isFinite(rounded)) return formulaError("NUM");
  const magnitude = Math.abs(rounded).toFixed(precision);
  const [integer, fraction] = magnitude.split(".");
  const grouped = noCommas ? integer! : integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const result =
    decimals < 0 ? grouped : fraction === undefined ? grouped : `${grouped}.${fraction}`;
  if (currency) return value < 0 ? `($${result})` : `$${result}`;
  return value < 0 ? `-${result}` : result;
}

function textAround(context: FormulaFunctionContext, before: boolean): FormulaValue {
  const source = text(direct(context, 0));
  const delimiter = text(direct(context, 1));
  const instance = context.argumentCount > 2 ? count(context, 2) : 1;
  const matchMode = context.argumentCount > 3 ? count(context, 3) : 0;
  const matchEnd = context.argumentCount > 4 ? count(context, 4) : 0;
  if (
    isFormulaError(source) ||
    isFormulaError(delimiter) ||
    isFormulaError(instance) ||
    isFormulaError(matchMode) ||
    isFormulaError(matchEnd)
  )
    return isFormulaError(source)
      ? source
      : isFormulaError(delimiter)
        ? delimiter
        : isFormulaError(instance)
          ? instance
          : isFormulaError(matchMode)
            ? matchMode
            : matchEnd;
  if (
    delimiter === "" ||
    instance === 0 ||
    (matchMode !== 0 && matchMode !== 1) ||
    (matchEnd !== 0 && matchEnd !== 1)
  )
    return formulaError("VALUE");
  const haystack = matchMode === 1 ? source.toLocaleLowerCase() : source;
  const needle = matchMode === 1 ? delimiter.toLocaleLowerCase() : delimiter;
  const occurrences: number[] = [];
  let offset = 0;
  while (offset <= haystack.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    occurrences.push(found);
    offset = found + needle.length;
  }
  const position = occurrences[instance > 0 ? instance - 1 : occurrences.length + instance];
  if (position === undefined) {
    if (matchEnd === 1) return before ? source : "";
    return context.argumentCount > 5 ? direct(context, 5) : formulaError("NA");
  }
  return before ? source.slice(0, position) : source.slice(position + delimiter.length);
}

export const TEXT_FUNCTIONS = [
  defineFunction(
    {
      name: "LEN",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value) ? value : [...value].length;
    },
  ),
  defineFunction(
    {
      name: "CHAR",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const code = count(context, 0);
      return isFormulaError(code) || code < 1 || code > 255
        ? formulaError("VALUE")
        : String.fromCharCode(code);
    },
  ),
  defineFunction(
    {
      name: "CODE",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value)
        ? value
        : value === ""
          ? formulaError("VALUE")
          : value.charCodeAt(0);
    },
  ),
  defineFunction(
    {
      name: "UNICHAR",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const code = count(context, 0);
      if (
        isFormulaError(code) ||
        code <= 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      )
        return formulaError("VALUE");
      return String.fromCodePoint(code);
    },
  ),
  defineFunction(
    {
      name: "UNICODE",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value)
        ? value
        : value === ""
          ? formulaError("VALUE")
          : value.codePointAt(0)!;
    },
  ),
  defineFunction(
    {
      name: "NUMBERVALUE",
      category: "Text",
      minArgs: 1,
      maxArgs: 3,
      arguments: [
        { name: "text" },
        { name: "decimal_separator", optional: true },
        { name: "group_separator", optional: true },
      ],
      lazy: false,
    },
    numberValue,
  ),
  defineFunction(
    {
      name: "DOLLAR",
      category: "Text",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "decimals", optional: true }],
      lazy: false,
    },
    (context) => fixedText(context, true),
  ),
  defineFunction(
    {
      name: "FIXED",
      category: "Text",
      minArgs: 1,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "decimals", optional: true },
        { name: "no_commas", optional: true },
      ],
      lazy: false,
    },
    (context) => fixedText(context, false),
  ),
  ...(["TEXTBEFORE", "TEXTAFTER"] as const).map((name) =>
    defineFunction(
      {
        name,
        category: "Text",
        minArgs: 2,
        maxArgs: 6,
        arguments: [
          { name: "text" },
          { name: "delimiter" },
          { name: "instance_num", optional: true },
          { name: "match_mode", optional: true },
          { name: "match_end", optional: true },
          { name: "if_not_found", optional: true },
        ],
        lazy: false,
      },
      (context) => textAround(context, name === "TEXTBEFORE"),
    ),
  ),
  defineFunction(
    {
      name: "LEFT",
      category: "Text",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "text" }, { name: "num_chars", optional: true }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      if (isFormulaError(value)) return value;
      const length = context.argumentCount === 1 ? 1 : count(context, 1);
      return isFormulaError(length) || length < 0
        ? formulaError("VALUE")
        : [...value].slice(0, length).join("");
    },
  ),
  defineFunction(
    {
      name: "RIGHT",
      category: "Text",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "text" }, { name: "num_chars", optional: true }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      if (isFormulaError(value)) return value;
      const length = context.argumentCount === 1 ? 1 : count(context, 1);
      return isFormulaError(length) || length < 0
        ? formulaError("VALUE")
        : length === 0
          ? ""
          : [...value].slice(-length).join("");
    },
  ),
  defineFunction(
    {
      name: "MID",
      category: "Text",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "text" }, { name: "start_num" }, { name: "num_chars" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      const start = count(context, 1);
      const length = count(context, 2);
      if (isFormulaError(value) || isFormulaError(start) || isFormulaError(length))
        return isFormulaError(value) ? value : isFormulaError(start) ? start : length;
      return start < 1 || length < 0
        ? formulaError("VALUE")
        : [...value].slice(start - 1, start - 1 + length).join("");
    },
  ),
  defineFunction(
    {
      name: "UPPER",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value) ? value : value.toUpperCase();
    },
  ),
  defineFunction(
    {
      name: "LOWER",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value) ? value : value.toLowerCase();
    },
  ),
  defineFunction(
    {
      name: "TRIM",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value) ? value : value.trim().replace(/ {2,}/g, " ");
    },
  ),
  defineFunction(
    {
      name: "CLEAN",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      return isFormulaError(value)
        ? value
        : Array.from(value, (character) => (character.codePointAt(0)! <= 31 ? "" : character)).join(
            "",
          );
    },
  ),
  defineFunction(
    {
      name: "CONCAT",
      category: "Text",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "text1" }, { name: "text2", optional: true }],
      lazy: false,
    },
    (context) => {
      const parts: string[] = [];
      for (let index = 0; index < context.argumentCount; index += 1) {
        const value = joinValues(context.evaluateArgument(index), false);
        if (isFormulaError(value)) return value;
        parts.push(value.replaceAll("\u0000", ""));
      }
      return parts.join("");
    },
  ),
  defineFunction(
    {
      name: "CONCATENATE",
      category: "Text",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "text1" }, { name: "text2", optional: true }],
      lazy: false,
    },
    (context) => {
      const parts: string[] = [];
      for (let index = 0; index < context.argumentCount; index += 1) {
        const value = joinValues(context.evaluateArgument(index), false);
        if (isFormulaError(value)) return value;
        parts.push(value.replaceAll("\u0000", ""));
      }
      return parts.join("");
    },
  ),
  defineFunction(
    {
      name: "TEXTJOIN",
      category: "Text",
      minArgs: 3,
      maxArgs: null,
      arguments: [
        { name: "delimiter" },
        { name: "ignore_empty" },
        { name: "text1" },
        { name: "text2", optional: true },
      ],
      lazy: false,
    },
    textJoin,
  ),
  defineFunction(
    {
      name: "SUBSTITUTE",
      category: "Text",
      minArgs: 3,
      maxArgs: 4,
      arguments: [
        { name: "text" },
        { name: "old_text" },
        { name: "new_text" },
        { name: "instance_num", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const source = text(direct(context, 0));
      const oldText = text(direct(context, 1));
      const newText = text(direct(context, 2));
      if (isFormulaError(source) || isFormulaError(oldText) || isFormulaError(newText))
        return isFormulaError(source) ? source : isFormulaError(oldText) ? oldText : newText;
      if (oldText === "") return source;
      if (context.argumentCount === 3) return source.split(oldText).join(newText);
      const instance = count(context, 3);
      if (isFormulaError(instance) || instance < 1) return formulaError("VALUE");
      let seen = 0;
      return source.replaceAll(oldText, (match) => (++seen === instance ? newText : match));
    },
  ),
  defineFunction(
    {
      name: "REPLACE",
      category: "Text",
      minArgs: 4,
      maxArgs: 4,
      arguments: [
        { name: "old_text" },
        { name: "start_num" },
        { name: "num_chars" },
        { name: "new_text" },
      ],
      lazy: false,
    },
    (context) => {
      const source = text(direct(context, 0));
      const start = count(context, 1);
      const length = count(context, 2);
      const replacement = text(direct(context, 3));
      if (
        isFormulaError(source) ||
        isFormulaError(start) ||
        isFormulaError(length) ||
        isFormulaError(replacement)
      )
        return isFormulaError(source)
          ? source
          : isFormulaError(start)
            ? start
            : isFormulaError(length)
              ? length
              : replacement;
      return start < 1 || length < 0
        ? formulaError("VALUE")
        : [...source].slice(0, start - 1).join("") +
            replacement +
            [...source].slice(start - 1 + length).join("");
    },
  ),
  defineFunction(
    {
      name: "FIND",
      category: "Text",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "find_text" },
        { name: "within_text" },
        { name: "start_num", optional: true },
      ],
      lazy: false,
    },
    (context) => find(context, false),
  ),
  defineFunction(
    {
      name: "SEARCH",
      category: "Text",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "find_text" },
        { name: "within_text" },
        { name: "start_num", optional: true },
      ],
      lazy: false,
    },
    (context) => find(context, true),
  ),
  defineFunction(
    {
      name: "EXACT",
      category: "Text",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "text1" }, { name: "text2" }],
      lazy: false,
    },
    (context) => {
      const a = text(direct(context, 0));
      const b = text(direct(context, 1));
      return isFormulaError(a) ? a : isFormulaError(b) ? b : a === b;
    },
  ),
  defineFunction(
    {
      name: "REPT",
      category: "Text",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "text" }, { name: "number_times" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      const times = count(context, 1);
      if (isFormulaError(value) || isFormulaError(times))
        return isFormulaError(value) ? value : times;
      if (times < 0 || value.length * times > 32_767) return formulaError("VALUE");
      return value.repeat(times);
    },
  ),
  defineFunction(
    {
      name: "VALUE",
      category: "Text",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "text" }],
      lazy: false,
    },
    (context) => {
      const value = text(direct(context, 0));
      if (isFormulaError(value)) return value;
      const parsed = Number(value.trim());
      return value.trim() === "" || !Number.isFinite(parsed) ? formulaError("VALUE") : parsed;
    },
  ),
  defineFunction(
    {
      name: "TEXT",
      category: "Text",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "value" }, { name: "format_text" }],
      lazy: false,
    },
    (context) => {
      const value = direct(context, 0);
      const formatText = text(direct(context, 1));
      if (isFormulaError(value) || isFormulaError(formatText))
        return isFormulaError(value) ? value : formatText;
      try {
        return formatCellNumberValue(
          value,
          { kind: "custom", code: formatText },
          { dateSystem: context.dateSystem },
        ).text;
      } catch {
        return formulaError("VALUE");
      }
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

function find(context: FormulaFunctionContext, insensitive: boolean): FormulaValue {
  const needle = text(direct(context, 0));
  const haystack = text(direct(context, 1));
  if (isFormulaError(needle) || isFormulaError(haystack))
    return isFormulaError(needle) ? needle : haystack;
  const start = context.argumentCount === 2 ? 1 : count(context, 2);
  if (isFormulaError(start) || start < 1) return formulaError("VALUE");
  const source = Array.from(insensitive ? haystack.toLocaleLowerCase() : haystack);
  const target = Array.from(insensitive ? needle.toLocaleLowerCase() : needle);
  if (start > source.length) return formulaError("VALUE");
  const index = insensitive
    ? findWildcardCharacters(source, target, start - 1)
    : findCharacters(source, target, start - 1);
  return index < 0 ? formulaError("VALUE") : index + 1;
}

function findWildcardCharacters(
  source: readonly string[],
  pattern: readonly string[],
  start: number,
): number {
  for (let index = start; index <= source.length; index += 1)
    if (wildcardMatches(source, pattern, index, 0)) return index;
  return -1;
}

function wildcardMatches(
  source: readonly string[],
  pattern: readonly string[],
  sourceIndex: number,
  patternIndex: number,
): boolean {
  while (patternIndex < pattern.length) {
    const character = pattern[patternIndex]!;
    if (character === "~") {
      const literal = pattern[patternIndex + 1] ?? "~";
      if (source[sourceIndex] !== literal) return false;
      sourceIndex += 1;
      patternIndex += patternIndex + 1 < pattern.length ? 2 : 1;
    } else if (character === "?") {
      if (sourceIndex >= source.length) return false;
      sourceIndex += 1;
      patternIndex += 1;
    } else if (character === "*") {
      while (pattern[patternIndex + 1] === "*") patternIndex += 1;
      if (patternIndex + 1 === pattern.length) return true;
      for (let next = sourceIndex; next <= source.length; next += 1)
        if (wildcardMatches(source, pattern, next, patternIndex + 1)) return true;
      return false;
    } else {
      if (source[sourceIndex] !== character) return false;
      sourceIndex += 1;
      patternIndex += 1;
    }
  }
  return true;
}

function findCharacters(
  source: readonly string[],
  target: readonly string[],
  start: number,
): number {
  if (target.length === 0) return start;
  for (let index = start; index + target.length <= source.length; index += 1) {
    if (target.every((character, offset) => source[index + offset] === character)) return index;
  }
  return -1;
}
