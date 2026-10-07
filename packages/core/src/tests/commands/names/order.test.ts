import { expect, test } from "vitest";
import {
  createDeleteDefinedNameCommand,
  createReorderDefinedNamesCommand,
  createUpsertDefinedNameCommand,
} from "../../../commands/names.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../../serialization.js";
import { createTestWorkbookSession } from "../../helpers.js";

function createNamesSession() {
  const session = createTestWorkbookSession();
  const ids = ["Sales", "Costs", "Totals"].map((name, index) => {
    const command = createUpsertDefinedNameCommand(session.workbook, {
      name,
      reference: `=Sheet1!A${index + 1}:B${index + 1}`,
      comment: `${name} range`,
      ...(index === 1 ? { scopeSheetId: session.workbook.activeSheetId } : {}),
    });
    executeWorkbookCommand(session, command);
    return command.definition.id;
  });
  return { session, ids };
}

test("defined-name order follows the command and survives undo, redo, and snapshot reload", () => {
  const { session, ids } = createNamesSession();
  const reordered = [ids[2]!, ids[0]!, ids[1]!];
  const definitions = new Map(session.workbook.definedNames);
  const command = createReorderDefinedNamesCommand(session.workbook, reordered);

  expect(command).toEqual({ type: "reorderDefinedNames", ids: reordered });
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  for (const [id, definition] of definitions) {
    expect(session.workbook.definedNames.get(id)).toEqual(definition);
  }

  const restored = deserializeWorkbook(serializeWorkbook(session.workbook));
  expect([...restored.definedNames.keys()]).toEqual(reordered);
  expect([...restored.definedNames.values()]).toEqual(reordered.map((id) => definitions.get(id)));

  undoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(ids);
  redoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
});

test("the reorder command owns its ID list", () => {
  const { session, ids } = createNamesSession();
  const reordered = [...ids].reverse();
  const command = createReorderDefinedNamesCommand(session.workbook, reordered);
  reordered.reverse();

  executeWorkbookCommand(session, command);
  expect([...session.workbook.definedNames.keys()]).toEqual([...ids].reverse());
});

test.each(["missing", "duplicate", "unknown", "extra"] as const)(
  "an invalid %s name-order permutation fails atomically at apply time",
  (kind) => {
    const { session, ids } = createNamesSession();
    const invalidIds = {
      missing: ids.slice(0, 2),
      duplicate: [ids[0]!, ids[0]!, ids[2]!],
      unknown: [ids[0]!, "unknown-name", ids[2]!],
      extra: [...ids, "unknown-name"],
    }[kind];
    const before = serializeWorkbook(session.workbook);
    const revision = session.history.revision;
    const undoCount = session.history.undoStack.length;

    expect(() =>
      executeWorkbookCommand(session, { type: "reorderDefinedNames", ids: invalidIds }),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
    expect(session.history.undoStack).toHaveLength(undoCount);
  },
);

test("unchanged name order creates no history and preserves an available redo", () => {
  const { session, ids } = createNamesSession();
  const reordered = [...ids].reverse();
  executeWorkbookCommand(session, createReorderDefinedNamesCommand(session.workbook, reordered));
  undoWorkbookCommand(session);
  const revision = session.history.revision;
  const undoCount = session.history.undoStack.length;
  const redoCount = session.history.redoStack.length;

  expect(
    executeWorkbookCommand(session, createReorderDefinedNamesCommand(session.workbook, ids)),
  ).toBe(false);
  expect(session.history.revision).toBe(revision);
  expect(session.history.undoStack).toHaveLength(undoCount);
  expect(session.history.redoStack).toHaveLength(redoCount);
  redoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
});

test("deleting a name and undoing restores its position in the reordered list", () => {
  const { session, ids } = createNamesSession();
  const reordered = [ids[2]!, ids[0]!, ids[1]!];
  executeWorkbookCommand(session, createReorderDefinedNamesCommand(session.workbook, reordered));
  const removedId = reordered[1]!;
  const removedDefinition = session.workbook.definedNames.get(removedId);
  executeWorkbookCommand(session, createDeleteDefinedNameCommand(session.workbook, removedId));
  expect([...session.workbook.definedNames.keys()]).toEqual([ids[2], ids[1]]);

  undoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  expect(session.workbook.definedNames.get(removedId)).toEqual(removedDefinition);
  redoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual([ids[2], ids[1]]);
  undoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  undoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(ids);
});

test("editing a reordered name keeps its position across undo and redo", () => {
  const { session, ids } = createNamesSession();
  const reordered = [ids[2]!, ids[0]!, ids[1]!];
  executeWorkbookCommand(session, createReorderDefinedNamesCommand(session.workbook, reordered));
  executeWorkbookCommand(
    session,
    createUpsertDefinedNameCommand(session.workbook, {
      id: ids[0]!,
      name: "Revenue",
      reference: "=Sheet1!C1:D1",
      comment: "Updated range",
    }),
  );
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  undoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  expect(session.workbook.definedNames.get(ids[0]!)?.name).toBe("Sales");
  redoWorkbookCommand(session);
  expect([...session.workbook.definedNames.keys()]).toEqual(reordered);
  expect(session.workbook.definedNames.get(ids[0]!)?.name).toBe("Revenue");
});
