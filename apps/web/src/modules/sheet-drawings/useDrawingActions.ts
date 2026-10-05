import { ref, shallowRef } from "vue";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { canUseSheetPermission } from "@idea10/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@idea10/core/commands";
import type { SheetDrawing } from "@idea10/core/sheet-drawings";
import type { Sheet, CellAddress } from "@idea10/core/workbook";
export function useDrawingActions(options: {
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  isBusy: () => boolean;
  name: (kind: SheetDrawing["kind"]) => string;
}) {
  const idFactory = createBrowserIdFactory();
  const editing = shallowRef<SheetDrawing>();
  const editingSheetId = ref("");
  let existing = false;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function insert(kind: SheetDrawing["kind"]) {
    if (!allowed() || !options.flush()) return;
    existing = false;
    editingSheetId.value = options.getSheet().id;
    editing.value = {
      id: idFactory("drawing"),
      kind,
      name: options.name(kind),
      anchor: { ...options.getAddress() },
      offsetX: 8,
      offsetY: 8,
      width: kind === "icon" ? 80 : 240,
      height: kind === "icon" ? 80 : 120,
      text:
        kind === "equation"
          ? "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
          : kind === "textBox" || kind === "wordArt"
            ? options.name(kind)
            : "",
      shape: kind === "icon" ? "star" : "rectangle",
      fill: kind === "shape" || kind === "icon" ? "#dbeafe" : "transparent",
      stroke: "#2563eb",
      strokeWidth: kind === "textBox" ? 0 : 1,
      color: "#1e3a8a",
      fontSize: kind === "wordArt" ? 36 : 20,
      bold: kind === "wordArt",
      italic: false,
      rotation: 0,
    };
  }
  function edit(drawing: SheetDrawing) {
    if (!allowed() || !options.flush()) return;
    existing = true;
    editingSheetId.value = options.getSheet().id;
    editing.value = drawing;
  }
  function update(drawing: SheetDrawing) {
    if (!allowed()) return;
    const sheet = options.getSheet();
    if (!sheet.drawings?.some((item) => item.id === drawing.id)) return;
    options.execute(
      createSetSheetDrawingsCommand(
        sheet.id,
        sheet.drawings.map((item) => (item.id === drawing.id ? drawing : item)),
      ),
    );
  }
  function confirm(drawing: SheetDrawing) {
    const sheet = options.getSheet();
    if (
      !allowed() ||
      editingSheetId.value !== sheet.id ||
      !editing.value ||
      editing.value.id !== drawing.id
    )
      return;
    if (existing) update(drawing);
    else
      options.execute(
        createSetSheetDrawingsCommand(sheet.id, [...(sheet.drawings ?? []), drawing]),
      );
    editing.value = undefined;
  }
  function remove(id: string) {
    if (!allowed()) return;
    const sheet = options.getSheet();
    options.execute(
      createSetSheetDrawingsCommand(
        sheet.id,
        (sheet.drawings ?? []).filter((item) => item.id !== id),
      ),
    );
  }
  return {
    editing,
    insert,
    edit,
    update,
    confirm,
    remove,
    close: () => {
      editing.value = undefined;
    },
  };
}
