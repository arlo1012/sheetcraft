import { effectScope, ref } from "vue";
import { describe, expect, test } from "vitest";
import { useDeferredSelectionSnapshot } from "../../../../modules/workbook/composables/useDeferredSelectionSnapshot";

const singleCellRange = {
  start: { row: 0, column: 0 },
  end: { row: 0, column: 0 },
};

describe("useDeferredSelectionSnapshot", () => {
  test("updates a single-cell keyboard selection synchronously", () => {
    const activeAddress = ref({ row: 0, column: 0 });
    const range = ref(singleCellRange);
    const scope = effectScope();
    let snapshot: ReturnType<typeof useDeferredSelectionSnapshot> | undefined;

    scope.run(() => {
      snapshot = useDeferredSelectionSnapshot({
        activeAddress,
        isDragging: ref(false),
        range,
        selectionMode: ref("cells"),
      });
    });
    activeAddress.value = { row: 0, column: 1 };
    range.value = {
      start: { row: 0, column: 1 },
      end: { row: 0, column: 1 },
    };

    expect(snapshot?.value.activeAddress).toEqual({ row: 0, column: 1 });
    scope.stop();
  });

  test("keeps keyboard changes immediate regardless of range size", () => {
    const activeAddress = ref({ row: 0, column: 0 });
    const range = ref(singleCellRange);
    const scope = effectScope();
    let snapshot: ReturnType<typeof useDeferredSelectionSnapshot> | undefined;

    scope.run(() => {
      snapshot = useDeferredSelectionSnapshot({
        activeAddress,
        isDragging: ref(false),
        range,
        selectionMode: ref("cells"),
      });
    });
    range.value = {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 99 },
    };
    expect(snapshot?.value.range.end.column).toBe(99);

    activeAddress.value = { row: 2, column: 3 };
    range.value = {
      start: { row: 2, column: 3 },
      end: { row: 2, column: 3 },
    };
    expect(snapshot?.value.activeAddress).toEqual({ row: 2, column: 3 });
    scope.stop();
  });

  test("keeps even a small selection frozen until a drag ends", () => {
    const activeAddress = ref({ row: 0, column: 0 });
    const range = ref(singleCellRange);
    const isDragging = ref(true);
    const scope = effectScope();
    let snapshot: ReturnType<typeof useDeferredSelectionSnapshot> | undefined;

    scope.run(() => {
      snapshot = useDeferredSelectionSnapshot({
        activeAddress,
        isDragging,
        range,
        selectionMode: ref("cells"),
      });
    });
    activeAddress.value = { row: 0, column: 1 };
    range.value = { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } };

    expect(snapshot?.value.activeAddress).toEqual({ row: 0, column: 0 });
    isDragging.value = false;
    expect(snapshot?.value.activeAddress).toEqual({ row: 0, column: 1 });
    scope.stop();
  });
});
