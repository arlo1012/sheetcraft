import { inject, type InjectionKey, type Ref } from "vue";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";

/** The document theme shared by color controls, font controls, and sheet rendering. */
export const workbookThemeKey: InjectionKey<Readonly<Ref<WorkbookTheme>>> = Symbol("workbookTheme");

export function useWorkbookTheme() {
  return inject(workbookThemeKey, undefined);
}
