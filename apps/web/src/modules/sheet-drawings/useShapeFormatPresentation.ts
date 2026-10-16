import { shallowRef, reactive, watch } from "vue";

/** Presentation only: never carries a command owner, draft, selection or focus. */
export interface ShapeFormatPresentation {
  textBoxOpen: boolean;
  fontOpen: boolean;
  paragraphOpen: boolean;
  scrollTop: number;
}
export interface ShapeFormatPresentationIdentity {
  workbook: object;
  generation: number;
  sheet: object;
  rootId: string;
  path: readonly string[];
}
export function useShapeFormatPresentation(
  identity: () => ShapeFormatPresentationIdentity | undefined,
) {
  const state = shallowRef<ShapeFormatPresentation>();
  let previous: ShapeFormatPresentationIdentity | undefined;
  watch(
    identity,
    (next) => {
      const same =
        next &&
        previous &&
        next.workbook === previous.workbook &&
        next.generation === previous.generation &&
        next.sheet === previous.sheet &&
        next.rootId === previous.rootId &&
        JSON.stringify(next.path) === JSON.stringify(previous.path);
      if (!same)
        state.value = next
          ? reactive({
              textBoxOpen: true,
              fontOpen: true,
              paragraphOpen: false,
              scrollTop: 0,
            })
          : undefined;
      previous = next;
    },
    // Coalesce an object/character handoff within one update; an actually closed
    // pane clears the single slot. Transaction/session keys remain independent.
    { immediate: true },
  );
  return state;
}
