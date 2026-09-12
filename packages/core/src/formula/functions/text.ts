import { isFormulaError, type FormulaValue } from "../types.js";
import { formatCellNumberValue } from "../../number-format.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionContext,
  FormulaFunctionDefinition,
} from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar } from "./helpers.js";

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
  const source = argument.kind === "range" ? argument.values : [argument.value];
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
    const source = argument.kind === "range" ? argument.values : [argument.value];
    for (const item of source) {
      const value = text(item);
      if (isFormulaError(value)) return value;
      if (!ignore || value !== "") items.push(value);
    }
  }
  return items.join(delimiter);
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
  const index = findCharacters(source, target, start - 1);
  return index < 0 ? formulaError("VALUE") : index + 1;
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
