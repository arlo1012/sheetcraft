import { expect, test } from "vitest";
import { createUpsertDefinedNameCommand } from "../../../commands/names.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../../serialization.js";
import { createTestWorkbookSession } from "../../helpers.js";

test("defined-name comments preserve an explicit empty value through update and history", () => {
  const session = createTestWorkbookSession();
  const create = createUpsertDefinedNameCommand(session.workbook, {
    name: "Sales",
    reference: "=Sheet1!A1",
    comment: "Sales totals",
  });
  executeWorkbookCommand(session, create);
  const definition = session.workbook.definedNames.get(create.definition.id)!;
  expect(definition.comment).toBe("Sales totals");

  const clear = createUpsertDefinedNameCommand(session.workbook, {
    id: definition.id,
    name: "Sales",
    reference: "=Sheet1!A1",
    comment: "",
  });
  executeWorkbookCommand(session, clear);
  expect(session.workbook.definedNames.get(definition.id)?.comment).toBe("");

  undoWorkbookCommand(session);
  expect(session.workbook.definedNames.get(definition.id)?.comment).toBe("Sales totals");
  redoWorkbookCommand(session);
  expect(session.workbook.definedNames.get(definition.id)?.comment).toBe("");
});

test("defined-name comments round trip workbook snapshots", () => {
  const session = createTestWorkbookSession();
  const command = createUpsertDefinedNameCommand(session.workbook, {
    name: "Sales",
    reference: "=Sheet1!A1",
    comment: "FY26 & plan",
  });
  executeWorkbookCommand(session, command);

  const restored = deserializeWorkbook(serializeWorkbook(session.workbook));
  expect(restored.definedNames.get(command.definition.id)?.comment).toBe("FY26 & plan");
});

test("defined-name comments reject values over Excel's 255-character limit", () => {
  const session = createTestWorkbookSession();
  expect(() =>
    createUpsertDefinedNameCommand(session.workbook, {
      name: "Sales",
      reference: "=Sheet1!A1",
      comment: "x".repeat(256),
    }),
  ).toThrow();
});
