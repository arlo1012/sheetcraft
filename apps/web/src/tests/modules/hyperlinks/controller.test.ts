import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellHyperlink,
  getCellStyle,
  insertSheet,
  setCellContent,
} from "@idea10/core/workbook";
import { useHyperlinksController } from "../../../modules/hyperlinks/useHyperlinksController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount>;
function fixture() {
  const workbook = createWorkbook({ id: "links", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const generation = ref(0);
  const navigate = vi.fn();
  const openExternal = vi.fn();
  let links!: ReturnType<typeof useHyperlinksController>;
  wrapper = mount(
    defineComponent({
      setup() {
        links = useHyperlinksController({
          getWorkbook: () => workbook,
          getSheet: () => sheet,
          getAddress: () => ({ row: 0, column: 0 }),
          getGeneration: () => generation.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute: (command) => executeWorkbookCommand(session, command),
          navigate,
          openExternal,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  return { workbook, sheet, session, links, generation, navigate, openExternal };
}
afterEach(() => wrapper.unmount());

describe("hyperlink controller", () => {
  test("creates a link and display text in one reversible action, then opens and marks it visited", () => {
    const { sheet, session, links, openExternal } = fixture();
    const address = { row: 0, column: 0 };
    links.edit();
    links.save({
      target: "https://example.com/report",
      displayText: "Report",
      tooltip: "Open report",
    });
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "Report" });
    expect(getCellHyperlink(sheet, address)).toMatchObject({
      target: "https://example.com/report",
      tooltip: "Open report",
    });
    undoWorkbookCommand(session);
    expect(getCellHyperlink(sheet, address)).toBeUndefined();
    expect(getCellContent(sheet, address)).toBeNull();
    redoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "Report" });
    links.open(address);
    expect(openExternal).toHaveBeenCalledWith("https://example.com/report");
    expect(getCellHyperlink(sheet, address)?.visited).toBe(true);
    expect(getCellStyle(sheet, address)?.textColor?.toLowerCase()).toBe("#800080");
  });

  test("preserves a formula and resolves an internal sheet target", () => {
    const { workbook, sheet, links, navigate } = fixture();
    const destination = createSheet("Report sheet", "destination");
    insertSheet(workbook, destination);
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "formula", formula: { source: "=1+1" } });
    links.edit();
    expect(links.draft.value?.canEditDisplay).toBe(false);
    links.save({ target: "#'Report sheet'!B3", displayText: "ignore", tooltip: "" });
    expect(getCellContent(sheet, address)).toEqual({
      kind: "formula",
      formula: { source: "=1+1" },
    });
    links.open(address);
    expect(navigate).toHaveBeenCalledWith("destination", { row: 2, column: 1 });
  });

  test("rejects an unsafe scheme and removes a link without clearing its text", () => {
    const { sheet, links } = fixture();
    const address = { row: 0, column: 0 };
    links.edit();
    links.save({ target: "javascript:alert(1)", displayText: "Click", tooltip: "" });
    expect(getCellHyperlink(sheet, address)).toBeUndefined();
    expect(links.error.value).toBeTruthy();
    links.save({ target: "mailto:user@example.com", displayText: "Email", tooltip: "" });
    links.edit();
    links.remove();
    expect(getCellHyperlink(sheet, address)).toBeUndefined();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "Email" });
  });

  test("closes the captured editor when the workbook is replaced", async () => {
    const { sheet, links, generation } = fixture();
    links.edit();
    generation.value += 1;
    await nextTick();
    expect(links.draft.value).toBeUndefined();
    links.save({ target: "https://example.com", displayText: "stale", tooltip: "" });
    expect(getCellHyperlink(sheet, { row: 0, column: 0 })).toBeUndefined();
  });
});
