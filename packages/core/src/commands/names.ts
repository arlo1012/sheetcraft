import { parseFormulaReference } from "../formula/reference-model.js";
import { parseA1FormulaReference } from "../formula/reference-model.js";
import type { DefinedName, Workbook } from "../workbook.js";
import type { DeleteDefinedNameCommand, UpsertDefinedNameCommand } from "./contracts.js";
import { invalidCommandPayload } from "./helpers.js";

export type DefinedNameDraft = {
  id?: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
};

const NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;

function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NAME_PATTERN.test(value) &&
    !parseA1FormulaReference(value) &&
    !/^R\d+C\d+$/i.test(value) &&
    !/^(TRUE|FALSE)$/i.test(value)
  );
}

export function createUpsertDefinedNameCommand(
  workbook: Workbook,
  draft: DefinedNameDraft,
): UpsertDefinedNameCommand {
  if (!isName(draft.name))
    throw invalidCommandPayload("name", draft.name);
  if (draft.scopeSheetId !== undefined && !workbook.sheets.has(draft.scopeSheetId))
    throw invalidCommandPayload("scopeSheetId", draft.scopeSheetId);
  if (
    draft.id === undefined &&
    [...workbook.definedNames.values()].some(
      (item) => item.scopeSheetId === draft.scopeSheetId && item.name.toUpperCase() === draft.name.toUpperCase(),
    )
  )
    throw invalidCommandPayload("name", draft.name);
  const source = typeof draft.reference === "string" && draft.reference.startsWith("=")
    ? draft.reference.slice(1)
    : draft.reference;
  const reference = parseFormulaReference(source, {
    currentSheetId: draft.scopeSheetId ?? workbook.activeSheetId,
    resolveSheetId: (name) =>
      [...workbook.sheets.values()].find((sheet) => sheet.name.toLowerCase() === name.toLowerCase())?.id,
  });
  if (!reference) throw invalidCommandPayload("reference", draft.reference);
  const id = draft.id ?? `${draft.scopeSheetId ?? "workbook"}:${draft.name.toUpperCase()}`;
  return {
    type: "upsertDefinedName",
    definition: {
      id,
      name: draft.name,
      ...(draft.scopeSheetId ? { scopeSheetId: draft.scopeSheetId } : {}),
      reference: {
        sheetId: reference.target.sheetId,
        start: reference.target.range.start,
        end: reference.target.range.end,
      },
    },
  };
}

export function createDeleteDefinedNameCommand(workbook: Workbook, id: string): DeleteDefinedNameCommand {
  if (!workbook.definedNames.has(id)) throw invalidCommandPayload("id", id);
  return { type: "deleteDefinedName", id };
}

export function applyUpsertDefinedNameCommand(
  workbook: Workbook,
  command: UpsertDefinedNameCommand,
): UpsertDefinedNameCommand | DeleteDefinedNameCommand {
  const definition = command.definition;
  if (!definition.id || !isName(definition.name) || !workbook.sheets.has(definition.reference.sheetId))
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
  workbook.definedNames.set(definition.id, cloneDefinedName(definition));
  return previous
    ? { type: "upsertDefinedName", definition: cloneDefinedName(previous) }
    : { type: "deleteDefinedName", id: definition.id };
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
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  };
}
