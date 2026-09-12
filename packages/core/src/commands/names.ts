import { parseFormulaReference } from "../formula/reference-model.js";
import { parseA1FormulaReference } from "../formula/reference-model.js";
import { getFormulaAst } from "../formula/parser.js";
import type { FormulaExpression } from "../formula/types.js";
import { setCellContent, type DefinedName, type Workbook } from "../workbook.js";
import type {
  DeleteDefinedNameCommand,
  FormulaSourceRestore,
  UpsertDefinedNameCommand,
} from "./contracts.js";
import { invalidCommandPayload } from "./helpers.js";

export type DefinedNameDraft = {
  id?: string;
  name: string;
  scopeSheetId?: string;
  comment?: string;
  reference: string;
};

const NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const MAX_DEFINED_NAME_COMMENT_LENGTH = 255;

function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NAME_PATTERN.test(value) &&
    !parseA1FormulaReference(value) &&
    !/^R\d+C\d+$/i.test(value) &&
    !/^(TRUE|FALSE)$/i.test(value)
  );
}

function isComment(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_DEFINED_NAME_COMMENT_LENGTH;
}

export function createUpsertDefinedNameCommand(
  workbook: Workbook,
  draft: DefinedNameDraft,
): UpsertDefinedNameCommand {
  if (!isName(draft.name)) throw invalidCommandPayload("name", draft.name);
  if (draft.comment !== undefined && !isComment(draft.comment))
    throw invalidCommandPayload("comment", draft.comment);
  if (draft.scopeSheetId !== undefined && !workbook.sheets.has(draft.scopeSheetId))
    throw invalidCommandPayload("scopeSheetId", draft.scopeSheetId);
  const existing = draft.id ? workbook.definedNames.get(draft.id) : undefined;
  if (existing && existing.scopeSheetId !== draft.scopeSheetId)
    throw invalidCommandPayload("scopeSheetId", draft.scopeSheetId);
  if (
    draft.id === undefined &&
    [...workbook.definedNames.values()].some(
      (item) =>
        item.scopeSheetId === draft.scopeSheetId &&
        item.name.toUpperCase() === draft.name.toUpperCase(),
    )
  )
    throw invalidCommandPayload("name", draft.name);
  const source =
    typeof draft.reference === "string" && draft.reference.startsWith("=")
      ? draft.reference.slice(1)
      : draft.reference;
  const reference = parseFormulaReference(source, {
    currentSheetId: draft.scopeSheetId ?? workbook.activeSheetId,
    resolveSheetId: (name) =>
      [...workbook.sheets.values()].find((sheet) => sheet.name.toLowerCase() === name.toLowerCase())
        ?.id,
  });
  if (!reference) throw invalidCommandPayload("reference", draft.reference);
  const id = draft.id ?? `${draft.scopeSheetId ?? "workbook"}:${draft.name.toUpperCase()}`;
  return {
    type: "upsertDefinedName",
    definition: {
      id,
      name: draft.name,
      ...(draft.scopeSheetId ? { scopeSheetId: draft.scopeSheetId } : {}),
      ...(draft.comment !== undefined
        ? { comment: draft.comment }
        : existing?.comment !== undefined
          ? { comment: existing.comment }
          : {}),
      reference: {
        sheetId: reference.target.sheetId,
        start: reference.target.range.start,
        end: reference.target.range.end,
      },
    },
  };
}

export function createDeleteDefinedNameCommand(
  workbook: Workbook,
  id: string,
): DeleteDefinedNameCommand {
  if (!workbook.definedNames.has(id)) throw invalidCommandPayload("id", id);
  return { type: "deleteDefinedName", id };
}

export function applyUpsertDefinedNameCommand(
  workbook: Workbook,
  command: UpsertDefinedNameCommand,
): UpsertDefinedNameCommand | DeleteDefinedNameCommand {
  const definition = command.definition;
  if (
    !definition.id ||
    !isName(definition.name) ||
    (definition.comment !== undefined && !isComment(definition.comment)) ||
    !workbook.sheets.has(definition.reference.sheetId)
  )
    throw invalidCommandPayload("definition", definition);
  if (definition.scopeSheetId !== undefined && !workbook.sheets.has(definition.scopeSheetId))
    throw invalidCommandPayload("definition.scopeSheetId", definition.scopeSheetId);
  const duplicate = [...workbook.definedNames.values()].find(
    (item) =>
      item.id !== definition.id &&
      item.scopeSheetId === definition.scopeSheetId &&
      item.name.toUpperCase() === definition.name.toUpperCase(),
  );
  if (duplicate) throw invalidCommandPayload("definition.name", definition.name);
  const previous = workbook.definedNames.get(definition.id);
  if (previous && previous.scopeSheetId !== definition.scopeSheetId) {
    throw invalidCommandPayload("definition.scopeSheetId", definition.scopeSheetId);
  }
  if (
    !command.formulaSources &&
    previous !== undefined &&
    previous.scopeSheetId === undefined &&
    previous.name.toUpperCase() !== definition.name.toUpperCase() &&
    [...workbook.definedNames.values()].some(
      (item) =>
        item.scopeSheetId !== undefined &&
        item.name.toUpperCase() === definition.name.toUpperCase(),
    )
  ) {
    throw invalidCommandPayload("definition.name", definition.name);
  }
  let inverseFormulaSources = command.formulaSources
    ? captureFormulaSources(workbook, command.formulaSources)
    : [];
  workbook.definedNames.set(definition.id, cloneDefinedName(definition));
  if (command.formulaSources) {
    restoreFormulaSources(workbook, command.formulaSources);
  } else if (previous) {
    inverseFormulaSources = renameDefinedNameReferences(workbook, previous, definition);
  }
  if (previous) {
    return {
      type: "upsertDefinedName",
      definition: cloneDefinedName(previous),
      formulaSources: inverseFormulaSources,
    };
  }
  return { type: "deleteDefinedName", id: definition.id };
}

/**
 * Formula source retains the spelling of a defined name, so a rename needs to
 * update identifier expressions that resolved to the renamed definition.
 * Parsing first deliberately avoids changing text inside strings or function
 * names that merely contain the former name.
 */
function renameDefinedNameReferences(
  workbook: Workbook,
  previous: DefinedName,
  definition: DefinedName,
): FormulaSourceRestore[] {
  if (previous.name === definition.name) return [];
  const previousName = previous.name.toUpperCase();
  const formulaSources: FormulaSourceRestore[] = [];

  for (const sheet of workbook.sheets.values()) {
    if (previous.scopeSheetId !== undefined && sheet.id !== previous.scopeSheetId) continue;
    if (
      previous.scopeSheetId === undefined &&
      [...workbook.definedNames.values()].some(
        (item) => item.scopeSheetId === sheet.id && item.name.toUpperCase() === previousName,
      )
    ) {
      continue;
    }
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const source = renameFormulaIdentifiers(
        cell.content.formula.source,
        previousName,
        definition.name,
      );
      if (source !== cell.content.formula.source) {
        const [rowText, columnText] = key.split(":");
        const row = Number(rowText);
        const column = Number(columnText);
        formulaSources.push({
          sheetId: sheet.id,
          address: { row, column },
          source: cell.content.formula.source,
        });
        setCellContent(sheet, { row, column }, { kind: "formula", formula: { source } });
      }
    }
  }
  return formulaSources;
}

function captureFormulaSources(
  workbook: Workbook,
  formulaSources: readonly FormulaSourceRestore[],
): FormulaSourceRestore[] {
  assertFormulaSources(formulaSources);
  return formulaSources.map((formula) => {
    const sheet = workbook.sheets.get(formula.sheetId);
    const source = sheet?.cells.get(`${formula.address.row}:${formula.address.column}`)?.content;
    if (!sheet || source?.kind !== "formula") {
      throw invalidCommandPayload("formulaSources", formula);
    }
    return {
      sheetId: formula.sheetId,
      address: { ...formula.address },
      source: source.formula.source,
    };
  });
}

function restoreFormulaSources(
  workbook: Workbook,
  formulaSources: readonly FormulaSourceRestore[],
): void {
  for (const formula of formulaSources) {
    setCellContent(workbook.sheets.get(formula.sheetId)!, formula.address, {
      kind: "formula",
      formula: { source: formula.source },
    });
  }
}

function assertFormulaSources(formulaSources: readonly FormulaSourceRestore[]): void {
  for (const formula of formulaSources) {
    if (
      !formula ||
      typeof formula.sheetId !== "string" ||
      !formula.address ||
      !Number.isInteger(formula.address.row) ||
      !Number.isInteger(formula.address.column) ||
      typeof formula.source !== "string" ||
      !formula.source.startsWith("=")
    ) {
      throw invalidCommandPayload("formulaSources", formula);
    }
  }
}

function renameFormulaIdentifiers(source: string, previousName: string, nextName: string): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const replacements: Array<{ start: number; end: number }> = [];
  const visit = (expression: FormulaExpression): void => {
    switch (expression.kind) {
      case "identifier":
        if (expression.name.toUpperCase() === previousName) {
          replacements.push({ start: expression.start, end: expression.end });
        }
        return;
      case "unary":
        visit(expression.operand);
        return;
      case "binary":
        visit(expression.left);
        visit(expression.right);
        return;
      case "function":
        expression.args.forEach(visit);
        return;
      default:
        return;
    }
  };
  visit(ast.expression);
  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, replacement) =>
        `${result.slice(0, replacement.start)}${nextName}${result.slice(replacement.end)}`,
      source,
    );
}

export function applyDeleteDefinedNameCommand(
  workbook: Workbook,
  command: DeleteDefinedNameCommand,
): UpsertDefinedNameCommand | null {
  const previous = workbook.definedNames.get(command.id);
  if (!previous) return null;
  workbook.definedNames.delete(command.id);
  return { type: "upsertDefinedName", definition: cloneDefinedName(previous) };
}

function cloneDefinedName(definition: DefinedName): DefinedName {
  return {
    id: definition.id,
    name: definition.name,
    ...(definition.scopeSheetId ? { scopeSheetId: definition.scopeSheetId } : {}),
    ...(definition.comment !== undefined ? { comment: definition.comment } : {}),
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  };
}
