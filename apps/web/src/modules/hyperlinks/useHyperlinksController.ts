import { canUseSheetPermission } from "@sheetcraft/core";
import { nextTick, ref, shallowRef, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { formatCellContentForInput } from "@sheetcraft/core/input";
import {
  createSetCellHyperlinkCommand,
  createMarkCellHyperlinkVisitedCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  getCellContent,
  getCellHyperlink,
  normalizeCellHyperlink,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";

export type HyperlinkInput = { target: string; displayText: string; tooltip: string };
export type HyperlinkDraft = HyperlinkInput & { hasLink: boolean; canEditDisplay: boolean };
type Target = { sheetId: string; address: CellAddress };

export function useHyperlinksController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  getGeneration: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  navigate: (sheetId: string, address: CellAddress) => void;
  openExternal: (target: string) => void;
  focus: () => void;
}) {
  const { t } = useAppI18n();
  const draft = shallowRef<HyperlinkDraft>();
  const error = ref("");
  let target: Target | undefined;

  function close(): void {
    draft.value = undefined;
    target = undefined;
    error.value = "";
    void nextTick(options.focus);
  }
  watch(options.getGeneration, close);

  function edit(): void {
    if (
      options.isBusy() ||
      !canUseSheetPermission(options.getSheet(), "insertHyperlinks") ||
      !options.finishEditing()
    )
      return;
    const sheet = options.getSheet();
    const address = { ...options.getAddress() };
    const content = getCellContent(sheet, address);
    const link = getCellHyperlink(sheet, address);
    const displayText = formatCellContentForInput(content);
    target = { sheetId: sheet.id, address };
    error.value = "";
    draft.value = {
      target: link?.target ?? (/^(https?:\/\/|mailto:|#)/i.test(displayText) ? displayText : ""),
      tooltip: link?.tooltip ?? "",
      displayText,
      hasLink: Boolean(link),
      canEditDisplay: !content || (content.kind === "literal" && typeof content.value === "string"),
    };
  }

  function validTarget(value: string, sheetId: string): boolean {
    try {
      normalizeCellHyperlink({ target: value });
      if (value.startsWith("#")) {
        const reference = resolveRangeReference(options.getWorkbook(), value.slice(1), sheetId);
        return Boolean(
          reference && !options.getWorkbook().sheets.get(reference.sheetId)?.properties.hidden,
        );
      }
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol)
        ? Boolean(parsed.hostname)
        : parsed.protocol === "mailto:" && Boolean(parsed.pathname);
    } catch {
      return false;
    }
  }

  function save(value: HyperlinkInput): void {
    if (!target || !draft.value || options.isBusy()) return;
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (!sheet || !canUseSheetPermission(sheet, "insertHyperlinks")) return;
    const address = value.target.trim();
    if (!validTarget(address, target.sheetId)) {
      error.value = t("hyperlinks.invalidTarget");
      return;
    }
    try {
      const displayText =
        draft.value.canEditDisplay &&
        (value.displayText !== draft.value.displayText || !draft.value.displayText)
          ? value.displayText || address
          : undefined;
      options.execute(
        createSetCellHyperlinkCommand(
          target.sheetId,
          target.address,
          {
            target: address,
            ...(value.tooltip.trim() ? { tooltip: value.tooltip.trim() } : {}),
            ...(getCellHyperlink(sheet, target.address)?.target === address
              ? { visited: getCellHyperlink(sheet, target.address)?.visited }
              : {}),
          },
          displayText,
        ),
      );
      close();
    } catch {
      error.value = t("hyperlinks.failed");
    }
  }

  function remove(): void {
    if (!target || options.isBusy()) return;
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (!sheet || !canUseSheetPermission(sheet, "insertHyperlinks")) return;
    try {
      options.execute(createSetCellHyperlinkCommand(target.sheetId, target.address, null));
      close();
    } catch {
      error.value = t("hyperlinks.failed");
    }
  }

  function open(address: CellAddress): void {
    if (options.isBusy() || !options.finishEditing()) return;
    const sheet = options.getSheet();
    const link = getCellHyperlink(sheet, address);
    if (!link) return;
    if (!validTarget(link.target, sheet.id)) {
      void MessagePlugin.warning(t("hyperlinks.unavailableTarget"));
      return;
    }
    if (link.target.startsWith("#")) {
      const reference = resolveRangeReference(
        options.getWorkbook(),
        link.target.slice(1),
        sheet.id,
      )!;
      options.navigate(reference.sheetId, reference.range.start);
    } else options.openExternal(link.target);
    if (!sheet.properties.protected && !link.visited) {
      options.execute(createMarkCellHyperlinkVisitedCommand(sheet.id, address));
    }
  }

  return { draft, error, edit, save, remove, open, close };
}
