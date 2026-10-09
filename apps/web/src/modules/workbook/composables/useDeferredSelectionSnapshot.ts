import type { CellAddress, CellRange } from "@sheetcraft/core/workbook";
import { computed, readonly, shallowRef, watch, type Ref } from "vue";

export type DeferredSelectionSnapshot = {
  activeAddress: CellAddress;
  mode: "cells" | "rows" | "columns" | "all";
  range: CellRange;
};

type DeferredSelectionSnapshotOptions = {
  activeAddress: Readonly<Ref<CellAddress>>;
  isDragging: Readonly<Ref<boolean>>;
  range: Readonly<Ref<CellRange>>;
  selectionMode: Readonly<Ref<DeferredSelectionSnapshot["mode"]>>;
};

function cloneSnapshot(
  activeAddress: CellAddress,
  mode: DeferredSelectionSnapshot["mode"],
  range: CellRange,
): DeferredSelectionSnapshot {
  return {
    activeAddress: { ...activeAddress },
    mode,
    range: { start: { ...range.start }, end: { ...range.end } },
  };
}

/** Freezes toolbar derivations during pointer selection drags only. */
export function useDeferredSelectionSnapshot({
  activeAddress,
  isDragging,
  range,
  selectionMode,
}: DeferredSelectionSnapshotOptions) {
  const settledSnapshot = shallowRef(
    cloneSnapshot(activeAddress.value, selectionMode.value, range.value),
  );
  const refresh = () => {
    settledSnapshot.value = cloneSnapshot(activeAddress.value, selectionMode.value, range.value);
  };
  watch(isDragging, refresh, { flush: "sync" });

  return readonly(
    computed(() =>
      isDragging.value
        ? settledSnapshot.value
        : cloneSnapshot(activeAddress.value, selectionMode.value, range.value),
    ),
  );
}
