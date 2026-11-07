import { canUseSheetPermission } from "@sheetcraft/core";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
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
import { readHyperlinkTarget } from "./hyperlink-target";
import { loadRecentEmailAddresses, rememberEmailAddress } from "./recent-email-addresses";

export type HyperlinkInput = { target: string; displayText: string; tooltip: string };
export type HyperlinkDraft = HyperlinkInput & {
  hasLink: boolean;
  canEditDisplay: boolean;
  initialPage?: "cloud";
};
type HyperlinkDialogTarget = {
  dialogId: number;
  workbook: Workbook;
  sheet: Sheet;
  address: CellAddress;
  generation: number;
  originalDisplayText: string;
  initial: HyperlinkDraft;
  confirm: (value: HyperlinkInput) => void;
  remove: () => void;
  cancel: () => void;
};

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
  const dialog = shallowRef<HyperlinkDialogTarget>();
  const draft = computed(() => dialog.value?.initial);
  const error = ref("");
  const recentEmails = ref(loadRecentEmailAddresses());
  const names = computed(() => {
    const owner = dialog.value;
    if (!owner) return [];
    const workbook = owner.workbook;
    const sheetId = owner.sheet.id;
    const visible = new Map<string, string>();
    for (const entry of workbook.definedNames.values()) {
      if (entry.scopeSheetId !== undefined && entry.scopeSheetId !== sheetId) continue;
      const key = entry.name.toLowerCase();
      if (entry.scopeSheetId === sheetId || !visible.has(key)) visible.set(key, entry.name);
    }
    return [...visible.values()].filter((name) => {
      const ref = resolveRangeReference(workbook, name, sheetId);
      return ref && !workbook.sheets.get(ref.sheetId)?.properties.hidden;
    });
  });
  let dialogSequence = 0;
  const isCurrent = (target: HyperlinkDialogTarget) =>
    dialog.value === target &&
    target.workbook === options.getWorkbook() &&
    target.generation === options.getGeneration() &&
    target.sheet === options.getSheet() &&
    target.workbook.sheets.get(target.sheet.id) === target.sheet &&
    target.address.row === options.getAddress().row &&
    target.address.column === options.getAddress().column;

  function close(target = dialog.value): void {
    if (!target || dialog.value !== target) return;
    dialog.value = undefined;
    error.value = "";
    void nextTick(() => {
      if (!dialog.value) options.focus();
    });
  }
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      () => options.getAddress().row,
      () => options.getAddress().column,
    ],
    () => close(),
    { flush: "sync" },
  );

  function edit(): void {
    beginEdit();
  }
  function editCloudDocument(filename = ""): void {
    beginEdit({ filename });
  }
  function beginEdit(cloudDocument?: { filename: string }): void {
    if (
      options.isBusy() ||
      !canUseSheetPermission(options.getSheet(), "insertHyperlinks") ||
      !options.finishEditing()
    )
      return;
    const sheet = options.getSheet();
    if (!canUseSheetPermission(sheet, "insertHyperlinks")) return;
    const address = { ...options.getAddress() };
    const content = getCellContent(sheet, address);
    const link = getCellHyperlink(sheet, address);
    const displayText = formatCellContentForInput(content);
    error.value = "";
    const current: HyperlinkDialogTarget = {
      dialogId: ++dialogSequence,
      workbook: options.getWorkbook(),
      sheet,
      address,
      generation: options.getGeneration(),
      originalDisplayText: displayText,
      initial: {
        target: link?.target ?? (/^(https?:\/\/|mailto:|#)/i.test(displayText) ? displayText : ""),
        tooltip: link?.tooltip ?? "",
        displayText: displayText || (cloudDocument && !content ? cloudDocument.filename : ""),
        ...(cloudDocument ? { initialPage: "cloud" as const } : {}),
        hasLink: Boolean(link),
        canEditDisplay:
          !content || (content.kind === "literal" && typeof content.value === "string"),
      },
      confirm: (value) => save(value, current),
      remove: () => remove(current),
      cancel: () => close(current),
    };
    dialog.value = current;
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

  function save(value: HyperlinkInput, target = dialog.value): void {
    if (!target || !isCurrent(target) || options.isBusy()) return;
    const sheet = target.sheet;
    if (!canUseSheetPermission(sheet, "insertHyperlinks")) return;
    const address = value.target.trim();
    if (!validTarget(address, sheet.id)) {
      error.value = t("hyperlinks.invalidTarget");
      return;
    }
    try {
      const displayText =
        target.initial.canEditDisplay &&
        (value.displayText !== target.originalDisplayText || !target.originalDisplayText)
          ? value.displayText || address
          : undefined;
      const accepted = options.execute(
        createSetCellHyperlinkCommand(
          sheet.id,
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
      if (!isCurrent(target)) return;
      if (!accepted) {
        error.value = t("hyperlinks.failed");
        return;
      }
      if (/^mailto:/i.test(address)) {
        const { emailAddress } = readHyperlinkTarget(address, sheet.name);
        recentEmails.value = rememberEmailAddress(recentEmails.value, emailAddress);
      }
      close(target);
    } catch {
      if (isCurrent(target)) error.value = t("hyperlinks.failed");
    }
  }

  function clearLink(sheet: Sheet, address: CellAddress): boolean {
    return options.execute(createSetCellHyperlinkCommand(sheet.id, address, null));
  }
  function removeFromMenu(address: CellAddress): void {
    if (options.isBusy() || !options.finishEditing()) return;
    const sheet = options.getSheet();
    if (!canUseSheetPermission(sheet, "insertHyperlinks") || !getCellHyperlink(sheet, address))
      return;
    try {
      if (clearLink(sheet, address)) return;
    } catch {
      /* Give the same feedback for a refused or failed command. */
    }
    void MessagePlugin.error(t("hyperlinks.failed"));
  }
  function remove(target = dialog.value): void {
    if (!target || !isCurrent(target) || options.isBusy()) return;
    const sheet = target.sheet;
    if (!canUseSheetPermission(sheet, "insertHyperlinks")) return;
    try {
      const accepted = clearLink(sheet, target.address);
      if (!isCurrent(target)) return;
      if (!accepted) {
        error.value = t("hyperlinks.failed");
        return;
      }
      close(target);
    } catch {
      if (isCurrent(target)) error.value = t("hyperlinks.failed");
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

  return {
    dialog,
    draft,
    error,
    names,
    recentEmails,
    edit,
    editCloudDocument,
    save,
    remove,
    removeFromMenu,
    open,
    close,
  };
}
