import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../shared/i18n";

const captured = vi.hoisted(() => ({
  controller: undefined as
    | ReturnType<
        typeof import("../../app/composables/useSpreadsheetWorkspaceController").useSpreadsheetWorkspaceController
      >
    | undefined,
}));

vi.mock("../../app/composables/useSpreadsheetWorkspaceController", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../app/composables/useSpreadsheetWorkspaceController")
    >();
  return {
    ...actual,
    useSpreadsheetWorkspaceController(
      ...args: Parameters<typeof actual.useSpreadsheetWorkspaceController>
    ) {
      const controller = actual.useSpreadsheetWorkspaceController(...args);
      captured.controller = controller;
      return controller;
    },
  };
});

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function getVisibleDialog(): HTMLElement | null {
  for (const ctx of document.body.querySelectorAll<HTMLElement>(".t-dialog__ctx")) {
    if (ctx.style.display === "none") continue;
    const dialog = ctx.querySelector<HTMLElement>(".t-dialog");
    if (dialog) return dialog;
  }
  return null;
}

function clickVisibleDialogConfirm(innerSelector?: string): void {
  const dialog = innerSelector
    ? document.body.querySelector(innerSelector)?.closest<HTMLElement>(".t-dialog")
    : getVisibleDialog();
  if (!dialog) throw new Error(`No visible dialog found (${innerSelector ?? "any"})`);
  const confirm = dialog.querySelector<HTMLButtonElement>(
    ".t-dialog__footer .t-button--theme-primary",
  );
  if (!confirm) throw new Error("No primary confirm button in visible dialog");
  confirm.click();
}

function isInsideHiddenDialog(element: Element): boolean {
  let node: Element | null = element;
  while (node) {
    if (
      node instanceof HTMLElement &&
      node.classList.contains("t-dialog__ctx") &&
      node.style.display === "none"
    )
      return true;
    node = node.parentElement;
  }
  return false;
}

function auditDocumentFormFields(stage: string, includeHiddenDialogs = false): string[] {
  const issues: string[] = [];
  const fields = document.body.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input, select, textarea");
  for (const field of fields) {
    if (field instanceof HTMLInputElement && field.type === "hidden") continue;
    if (field.getAttribute("aria-hidden") === "true") continue;
    if (!includeHiddenDialogs && isInsideHiddenDialog(field)) continue;
    // TDesign wraps checkboxes/radios inside <label class="t-checkbox|t-radio">;
    // its internal .t-checkbox__former/.t-radio__former inputs inherit label association.
    const isLibraryWrappedToggle =
      field instanceof HTMLInputElement &&
      (field.type === "checkbox" || field.type === "radio") &&
      Boolean(field.closest("label.t-checkbox, label.t-radio"));
    if (isLibraryWrappedToggle) continue;
    const id = field.getAttribute("id")?.trim();
    const name = field.getAttribute("name")?.trim();
    const hasIdOrName = Boolean(id || name);
    const hasForLabel = Boolean(
      id && document.body.querySelector(`label[for="${CSS.escape(id)}"]`),
    );
    const hasAncestorLabel = Boolean(field.closest("label"));
    const hasAriaLabel = Boolean(
      field.getAttribute("aria-label")?.trim() || field.getAttribute("aria-labelledby")?.trim(),
    );
    const hasAccessibleLabel = hasForLabel || hasAncestorLabel || hasAriaLabel;
    if (!hasIdOrName || !hasAccessibleLabel) {
      const host =
        field.closest("[data-ribbon-group], [role='dialog'], aside, header, footer")?.className ||
        field.parentElement?.className ||
        "";
      issues.push(
        `[${stage}] <${field.tagName.toLowerCase()} type="${field.getAttribute("type") ?? ""}" class="${field.className}" id="${id ?? ""}" name="${name ?? ""}" aria-label="${field.getAttribute("aria-label") ?? ""}"> host="${host}" missing=${!hasIdOrName ? "id/name" : ""}${!hasIdOrName && !hasAccessibleLabel ? "+" : ""}${!hasAccessibleLabel ? "label" : ""}`,
      );
    }
  }
  return issues;
}

async function mountWorkspace() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  [
    ["Region", "Product", "Sales"],
    ["North", "Widget", 120],
    ["South", "Gadget", 250],
    ["East", "Widget", 180],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("SpreadsheetWorkspace real DOM E2E regression across all 7 main tabs and Insert flows", () => {
  test("zero form accessibility issues across startup and all 7 loaded ribbon tabs", async () => {
    const wrapper = await mountWorkspace();
    const allIssues: string[] = [];

    allIssues.push(...auditDocumentFormFields("startup:home"));

    const tabs: readonly {
      id: "home" | "insert" | "page" | "formulas" | "data" | "review" | "view";
      readySelector: string;
    }[] = [
      { id: "home", readySelector: '[data-ribbon-group="structure"]' },
      { id: "insert", readySelector: '[data-insert-tool="table"]' },
      { id: "page", readySelector: ".page-layout-toolbar, [data-ribbon-group]" },
      { id: "formulas", readySelector: ".formula-toolbar, [data-ribbon-group]" },
      { id: "data", readySelector: ".data-toolbar, [data-ribbon-group]" },
      { id: "review", readySelector: ".review-toolbar, [data-ribbon-group]" },
      { id: "view", readySelector: '[data-view-tool="normal-view"]' },
    ];
    for (const tab of tabs) {
      await wrapper.get(`[data-ribbon-category="${tab.id}"]`).trigger("click");
      await flushPromises();
      await vi.waitFor(
        () => {
          expect(
            wrapper.get(`[data-ribbon-category="${tab.id}"]`).attributes("aria-selected"),
          ).toBe("true");
          expect(wrapper.find(tab.readySelector).exists()).toBe(true);
        },
        { timeout: 15000 },
      );
      allIssues.push(...auditDocumentFormFields(`tab:${tab.id}`));
    }

    expect(allIssues).toEqual([]);
  }, 60000);

  test("Insert Table, repeated Slicers (non-overlapping), Chart (avoiding source range), and PivotTable work end-to-end with clean form accessibility", async () => {
    const wrapper = await mountWorkspace();
    const controller = captured.controller!;
    controller.navigateToAddress("A1:C4");
    await flushPromises();

    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(wrapper.find('[data-insert-tool="table"]').exists()).toBe(true);
      },
      { timeout: 15000 },
    );

    // 1. Insert Table via Insert -> Table dialog
    await wrapper.get('[data-insert-tool="table"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(document.body.querySelector(".create-table-dialog")).not.toBeNull();
      },
      { timeout: 10000 },
    );
    expect(auditDocumentFormFields("dialog:create-table")).toEqual([]);
    clickVisibleDialogConfirm(".create-table-dialog");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(controller.activeSheet.value.tables?.length).toBe(1);
      },
      { timeout: 10000 },
    );
    expect(auditDocumentFormFields("contextual:table")).toEqual([]);

    // 2. Insert Slicer twice -> verify Select All button + non-overlapping 3-col placement
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-insert-tool="slicer"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(document.body.querySelector("[data-slicer-toggle-all]")).not.toBeNull();
      },
      { timeout: 10000 },
    );
    expect(auditDocumentFormFields("dialog:slicer-1")).toEqual([]);
    document.body.querySelector<HTMLInputElement>('.slicer-fields input[type="checkbox"]')!.click();
    await flushPromises();
    clickVisibleDialogConfirm(".slicer-dialog");
    await flushPromises();

    // Second slicer insertion
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-insert-tool="slicer"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(document.body.querySelectorAll('.slicer-fields input[type="checkbox"]').length).toBe(
          3,
        );
      },
      { timeout: 10000 },
    );
    document.body
      .querySelectorAll<HTMLInputElement>('.slicer-fields input[type="checkbox"]')[1]!
      .click();
    await flushPromises();
    clickVisibleDialogConfirm(".slicer-dialog");
    await flushPromises();

    const slicers = (controller.activeSheet.value.drawings ?? []).filter(
      (item) => item.kind === "slicer",
    );
    expect(slicers).toHaveLength(2);
    expect(slicers[0]!.offsetX).not.toBe(slicers[1]!.offsetX);
    expect(auditDocumentFormFields("contextual:slicer")).toEqual([]);

    // 3. Insert Column Chart on A1:C4 -> verify chart anchors BESIDE source range (col >= 4)
    controller.navigateToAddress("A1:C4");
    await flushPromises();
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await flushPromises();
    await wrapper.get('.chart-insert-tools__columns [role="button"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(getVisibleDialog()).not.toBeNull();
      },
      { timeout: 10000 },
    );
    clickVisibleDialogConfirm();
    await flushPromises();

    const charts = (controller.activeSheet.value.drawings ?? []).filter(
      (item) => item.kind === "chart",
    );
    expect(charts).toHaveLength(1);
    expect(charts[0]!.anchor.column).toBeGreaterThanOrEqual(4);
    expect(auditDocumentFormFields("contextual:chart")).toEqual([]);

    // 4. Insert PivotTable on A1:C4 -> verify PivotFieldsPane opens with unified TButton close button
    controller.navigateToAddress("A1:C4");
    await flushPromises();
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-insert-tool="pivot-table"]').trigger("click");
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(getVisibleDialog()).not.toBeNull();
      },
      { timeout: 10000 },
    );
    clickVisibleDialogConfirm();
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
      },
      { timeout: 10000 },
    );
    expect(wrapper.find(".pivot-fields-pane__header button.t-button").exists()).toBe(true);
    expect(auditDocumentFormFields("contextual:pivot")).toEqual([]);
  }, 60000);
});
