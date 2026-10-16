import { computed, onScopeDispose, ref, watch } from "vue";

export type PictureEffectsFocusOwner = {
  workbook: object;
  sheet: object;
  generation: number;
  mode: "standalone" | "owned";
  targets: readonly { id: string; assetId: string }[];
  path: readonly string[] | null;
};

/** An appearance edit may replace children, but may not borrow a new selection's focus. */
export function usePictureEffectsFocusReturn(options: {
  getOwner: () => PictureEffectsFocusOwner | undefined;
  isBlocked: () => boolean;
  getTarget: (mode: PictureEffectsFocusOwner["mode"]) => HTMLElement | null;
}) {
  let live = true;
  const epoch = ref(0);
  const owner = computed(() => {
    const value = options.getOwner();
    if (!value) return undefined;
    return {
      workbook: value.workbook,
      sheet: value.sheet,
      generation: value.generation,
      mode: value.mode,
      selection: JSON.stringify([value.targets, value.path]),
    };
  });
  function same(a: typeof owner.value, b: typeof owner.value): boolean {
    return (
      a !== undefined &&
      b !== undefined &&
      a.workbook === b.workbook &&
      a.sheet === b.sheet &&
      a.generation === b.generation &&
      a.mode === b.mode &&
      a.selection === b.selection
    );
  }
  watch(
    owner,
    (next, previous) => {
      if (!same(next, previous)) epoch.value++;
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    live = false;
  });
  return computed(() => {
    const captured = owner.value,
      ticket = epoch.value;
    return (): HTMLElement | null => {
      if (
        !live ||
        !captured ||
        ticket !== epoch.value ||
        !same(captured, owner.value) ||
        options.isBlocked()
      )
        return null;
      return options.getTarget(captured.mode);
    };
  });
}
