import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
const choice = SHAPE_GALLERY.flatMap((g) => g.items).find(
  (c) => c.kind === "preset" && c.preset === "rect",
)!;
function fixture() {
  const wb = ref(createWorkbook({ idFactory: createSequentialIdFactory() })),
    sheet = ref(getActiveSheet(wb.value)),
    generation = ref(0),
    revision = ref(0),
    busy = ref(false);
  const session = createWorkbookSession({
    workbook: wb.value,
    idFactory: createSequentialIdFactory(),
  });
  const flush = vi.fn(() => true),
    onStart = vi.fn(),
    onCreated = vi.fn();
  const execute = vi.fn((command: WorkbookCommand) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  const actions = scope.run(() =>
    useShapeCreation({
      getWorkbook: () => wb.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getAddress: () => ({ row: 2, column: 3 }),
      isBusy: () => busy.value,
      flush,
      execute,
      onStart,
      onCreated,
    }),
  )!;
  return {
    wb,
    sheet,
    generation,
    revision,
    busy,
    session,
    flush,
    execute,
    onStart,
    onCreated,
    actions,
    scope,
  };
}
describe("owner-bound canvas shape creation", () => {
  test("one release is one reversible command, snapshot and ordinary ID", () => {
    const f = fixture();
    expect(f.actions.start(choice, false)).toBe(true);
    const r = f.actions.request.value!;
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.commit(r, { ...r.base, offsetX: 20, width: 300, height: 180 })).toBe(true);
    expect(f.actions.request.value).toBeUndefined();
    expect(f.execute).toHaveBeenCalledTimes(1);
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.value.drawings ?? []).toEqual([]);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(snapshot);
    f.scope.stop();
  });
  test("continuous releases use new IDs and stale callbacks cannot insert or cancel new request", () => {
    const f = fixture();
    f.actions.start(choice, true);
    const first = f.actions.request.value!;
    expect(f.actions.commit(first, first.base)).toBe(true);
    const next = f.actions.request.value!;
    expect(next.base.id).not.toBe(first.base.id);
    expect(next.revision).toBe(f.revision.value);
    expect(f.actions.commit(first, first.base)).toBe(false);
    f.actions.cancel(first);
    expect(f.actions.request.value).toBe(next);
    expect(f.actions.commit(next, next.base)).toBe(true);
    expect(f.sheet.value.drawings).toHaveLength(2);
    expect(f.execute).toHaveBeenCalledTimes(2);
    f.actions.cancel();
    expect(f.actions.request.value).toBeUndefined();
    f.scope.stop();
  });
  test("executor false/throw preserves request without claiming a created object", () => {
    for (const thrown of [false, true]) {
      const f = fixture();
      f.actions.start(choice, false);
      const r = f.actions.request.value!;
      f.execute.mockImplementation(() => {
        if (thrown) throw new Error("rejected");
        return false;
      });
      const before = serializeWorkbook(f.session.workbook);
      expect(f.actions.commit(r, r.base)).toBe(false);
      expect(f.actions.request.value).toBe(r);
      expect(f.onCreated).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      f.scope.stop();
    }
  });
  test.each([
    "sheet",
    "workbook",
    "generation",
    "revision",
    "busy",
    "permission",
    "dispose",
  ] as const)("%s invalidates uncommitted creation", (change) => {
    const f = fixture();
    f.actions.start(choice, true);
    const r = f.actions.request.value!;
    if (change === "sheet") {
      const other = createSheet("other", "other");
      f.wb.value.sheets.set(other.id, other);
      f.sheet.value = other;
    }
    if (change === "workbook") {
      f.wb.value = createWorkbook({ id: "replacement", sheetId: f.sheet.value.id });
      f.sheet.value = getActiveSheet(f.wb.value);
    }
    if (change === "generation") f.generation.value++;
    if (change === "revision") f.revision.value++;
    if (change === "busy") f.busy.value = true;
    if (change === "permission") f.sheet.value.properties.protected = true;
    if (change === "dispose") f.scope.stop();
    expect(f.actions.request.value).toBeUndefined();
    expect(f.actions.commit(r, r.base)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    f.scope.stop();
  });
  test("captured menu owner does not retarget after switching or during flush; failed flush preserves existing request", () => {
    const f = fixture();
    f.actions.start(choice, true);
    const r = f.actions.request.value!;
    f.flush.mockReturnValue(false);
    expect(f.actions.start(choice, false)).toBe(false);
    expect(f.actions.request.value).toBe(r);
    f.flush.mockImplementation(() => {
      f.generation.value++;
      return true;
    });
    expect(f.actions.start(choice, false)).toBe(false);
    expect(f.actions.request.value).toBeUndefined();
    const owner = f.actions.captureOwner();
    f.generation.value++;
    expect(f.actions.start(choice, false, owner)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    f.scope.stop();
  });
  test("identity, kind, preset and invalid payload reject atomically", () => {
    const f = fixture();
    f.actions.start(choice, false);
    const r = f.actions.request.value!;
    for (const d of [
      { ...r.base, id: "other" },
      { ...r.base, kind: "textBox" as const },
      { ...r.base, shapeGeometry: { preset: "ellipse" as const } },
      { ...r.base, width: Infinity },
    ])
      expect(f.actions.commit(r, d)).toBe(false);
    expect(f.actions.request.value).toBe(r);
    expect(f.execute).not.toHaveBeenCalled();
    f.scope.stop();
  });
  test("reentrant new start wins and old start does not arm again", () => {
    const f = fixture();
    let reentered = false;
    f.onStart.mockImplementation(() => {
      if (!reentered) {
        reentered = true;
        f.actions.start(choice, true);
      }
    });
    expect(f.actions.start(choice, false)).toBe(false);
    expect(f.actions.request.value?.continuous).toBe(true);
    f.scope.stop();
  });
  test.each([false, true])(
    "postcommit selection exception still reports durable success (continuous %s)",
    (continuous) => {
      const f = fixture();
      f.onCreated.mockImplementation(() => {
        throw new Error("selection failed");
      });
      f.actions.start(choice, continuous);
      const r = f.actions.request.value!;
      expect(f.actions.commit(r, r.base)).toBe(true);
      expect(f.sheet.value.drawings).toHaveLength(1);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.actions.commit(r, r.base)).toBe(false);
      f.scope.stop();
    },
  );

  test.each(["throw", "false"] as const)(
    "post-Core executor %s does not misreport or retry the committed ID",
    (outcome) => {
      const f = fixture();
      f.actions.start(choice, true);
      const r = f.actions.request.value!;
      f.execute.mockImplementation((command) => {
        executeWorkbookCommand(f.session, command);
        if (outcome === "throw") throw new Error("postcommit invalidation");
        return false;
      });
      expect(f.actions.commit(r, r.base)).toBe(true);
      expect(f.sheet.value.drawings).toHaveLength(1);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.actions.commit(r, r.base)).toBe(false);
      f.scope.stop();
    },
  );
});
