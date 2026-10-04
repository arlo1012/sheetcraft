import { createSetWorkbookThemeCommand, type WorkbookCommand } from "@idea10/core/commands";
import type { WorkbookTheme } from "@idea10/core/workbook-theme";
import { nextTick } from "vue";

export function usePageThemeController(options: {
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  focus: () => void;
}) {
  function apply(theme: WorkbookTheme): boolean {
    if (options.isBusy() || !options.finishEditing()) return false;
    const changed = options.execute(createSetWorkbookThemeCommand(theme));
    if (changed) void nextTick(options.focus);
    return changed;
  }
  return { apply };
}
