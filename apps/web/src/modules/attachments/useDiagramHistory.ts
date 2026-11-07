import { ref, useTemplateRef, type Ref } from "vue";
import { useHistoryShortcutBoundary } from "../../shared/keyboard/useHistoryShortcutBoundary";

/** Store one snapshot per completed editor gesture; worksheet history begins at Save. */
export function useDiagramHistory<T>(draft: Ref<T | undefined>, onRestore: () => void) {
  const element = useTemplateRef<HTMLElement>("historyElement");
  const history = ref<string[]>([]);
  const cursor = ref(-1);
  function record() {
    if (!draft.value) return;
    const snapshot = JSON.stringify(draft.value);
    if (history.value[cursor.value] === snapshot) return;
    history.value.splice(cursor.value + 1, Infinity, snapshot);
    if (history.value.length > 50) history.value.shift();
    cursor.value = history.value.length - 1;
  }
  function travel(step: number) {
    record();
    const next = cursor.value + step;
    if (next < 0 || next >= history.value.length) return false;
    draft.value = JSON.parse(history.value[next]!);
    cursor.value = next;
    onRestore();
    return true;
  }
  record();
  useHistoryShortcutBoundary({
    owns: (target) => target instanceof Element && !!element.value?.contains(target),
    composing: () => false,
    step: (direction) => travel(direction === "undo" ? -1 : 1),
  });
  return { history, cursor, record, travel };
}
