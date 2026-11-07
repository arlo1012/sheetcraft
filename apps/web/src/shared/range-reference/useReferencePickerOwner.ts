import { nextTick, shallowRef } from "vue";
import type { Sheet } from "@sheetcraft/core/workbook";

/** Keep the editing sheet while a reference is picked on another worksheet. */
export function useReferencePickerOwner(selectSheet?: (id: string) => void) {
  const owner = shallowRef<Sheet>();
  async function pick(
    sheet: Sheet,
    current: () => boolean,
    select: () => Promise<string | undefined>,
    restoreSelection?: () => void,
  ) {
    if (owner.value || !current()) return;
    owner.value = sheet;
    try {
      const selected = await select();
      return current() ? selected : undefined;
    } finally {
      try {
        if (current()) {
          selectSheet?.(sheet.id);
          await nextTick();
          if (current()) restoreSelection?.();
        }
      } finally {
        owner.value = undefined;
      }
    }
  }
  return { owner, pick };
}
