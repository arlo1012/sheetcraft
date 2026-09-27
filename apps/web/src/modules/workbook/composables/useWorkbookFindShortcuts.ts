import { onBeforeUnmount, onMounted } from "vue";
import type { WorkbookFindMode } from "../workbook-find-types";

export function getWorkbookFindShortcut(event: KeyboardEvent): WorkbookFindMode | undefined {
  if (event.isComposing || event.altKey || event.shiftKey) return;
  if (event.key === "F5" && !event.ctrlKey && !event.metaKey) return "goto";
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === "f" || event.code === "KeyF") return "find";
  if (key === "h" || event.code === "KeyH") return "replace";
  if (key === "g" || event.code === "KeyG") return "goto";
}

/** Window capture also covers a modeless dialog teleported outside the workspace. */
export function useWorkbookFindShortcuts(options: {
  canOpen: (event: KeyboardEvent) => boolean;
  open: (mode: WorkbookFindMode) => void;
}): void {
  function onKeydown(event: KeyboardEvent): void {
    const mode = getWorkbookFindShortcut(event);
    if (!mode || !options.canOpen(event)) return;
    event.preventDefault();
    event.stopPropagation();
    options.open(mode);
  }
  onMounted(() => window.addEventListener("keydown", onKeydown, true));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
}
