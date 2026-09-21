import { mount, DOMWrapper } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import TextToColumnsDialog from "../../../../modules/data-tools/components/TextToColumnsDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

const suggestion = {
  id: "comma",
  options: { mode: "delimiter" as const, delimiters: [","], textQualifier: '"' as const },
  confidence: 1,
  columnCount: 2,
};
const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountDialog(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(TextToColumnsDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      destinationLabel: "E1",
      previewRows: [{ row: 0, values: ["first", "second"] }],
      sourceRows: [{ row: 0, text: "first,second" }],
      suggestions: [suggestion],
      ...overrides,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function next(wrapper: ReturnType<typeof mount>) {
  await wrapper.get("[data-split-next]").trigger("click");
  await nextTick();
}

function byText(selector: string, label: string): DOMWrapper<Element> {
  const element = [...document.querySelectorAll(selector)].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!element) throw new Error(`Could not find ${selector} with text ${label}.`);
  return new DOMWrapper(element);
}

async function selectColumnType(wrapper: ReturnType<typeof mount>, label: string) {
  const field = wrapper.get("[data-text-to-columns-column-type]");
  const option = field.findAll(".t-radio").find((radio) => radio.text().trim() === label);
  if (!option) throw new Error(`Could not find column format ${label}.`);
  await option.trigger("click");
  await nextTick();
}

async function switchToFixedWidth() {
  await byText(".t-tabs__nav-item", "Custom split").trigger("click");
  await nextTick();
  await byText(".t-radio", "Fixed width").trigger("click");
  await nextTick();
}

describe("TextToColumnsDialog flow regressions", () => {
  test("reselects a source range without truncating it to one cell and keeps it after cancelling", async () => {
    const selectReference = vi.fn().mockResolvedValueOnce("B3:B8").mockResolvedValueOnce(undefined);
    const dialog = mountDialog({ rangeLabel: "A1:A2", destinationLabel: "A1", selectReference });
    expect(dialog.find(".t-steps").exists()).toBe(false);
    const source = dialog.get(".text-to-columns-dialog__source");
    await source.get("input").setValue("B3:B4");
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({ source: "B3:B4" });
    await source.get("button").trigger("click");
    await nextTick();
    expect(selectReference).toHaveBeenLastCalledWith("B3:B4", { singleCell: false });
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({ source: "B3:B8" });
    await source.get("button").trigger("click");
    await nextTick();
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({ source: "B3:B8" });
  });

  test("moves the default destination with the source but preserves a manually chosen destination", async () => {
    const dialog = mountDialog({ rangeLabel: "A1:A2", destinationLabel: "A1" });
    await dialog.setProps({ destinationLabel: "B3" });
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({ destination: "B3" });
    await next(dialog);
    await dialog.get(".text-to-columns-dialog__destination input").setValue("F5");
    await dialog.setProps({ destinationLabel: "C7" });
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({ destination: "F5" });
  });

  test("does not recurse when the parent recreates preview and suggestions for every draft update", async () => {
    let draftChanges = 0;
    const host = mount(
      defineComponent({
        components: { TextToColumnsDialog },
        setup() {
          const previewRows = ref([{ row: 0, values: ["first", "second"] }]);
          const suggestions = ref([
            { ...suggestion, options: { ...suggestion.options, delimiters: [","] } },
          ]);
          const onDraftChange = () => {
            draftChanges += 1;
            previewRows.value = previewRows.value.map((row) => ({
              ...row,
              values: [...row.values],
            }));
            suggestions.value = suggestions.value.map((item) => ({
              ...item,
              options: { ...item.options, delimiters: [...(item.options.delimiters ?? [])] },
            }));
          };
          return { onDraftChange, previewRows, suggestions };
        },
        template: `<TextToColumnsDialog visible destination-label="E1" :preview-rows="previewRows" :suggestions="suggestions" @draft-change="onDraftChange" />`,
      }),
      { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
    );
    mounted.push(host);

    await nextTick();
    await nextTick();
    expect(draftChanges).toBeGreaterThan(0);
    expect(draftChanges).toBeLessThan(4);
  });

  test("disables Finish and ignores Dialog confirm when every output column is skipped", async () => {
    const dialog = mountDialog();
    await next(dialog);
    await selectColumnType(dialog, "Do not import");
    await dialog.get('[data-split-column="1"]').trigger("click");
    await selectColumnType(dialog, "Do not import");

    expect(dialog.get("[data-split-next]").attributes("disabled")).toBeDefined();
    dialog.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(dialog.emitted("apply")).toBeUndefined();
  });

  test("keeps output formats while range picking is active and restores the default candidate on reopen", async () => {
    const dialog = mountDialog();
    await next(dialog);
    await selectColumnType(dialog, "Text");
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["text", "general"],
    });

    await dialog.setProps({ picking: true });
    await dialog.setProps({ picking: false });
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["text", "general"],
    });

    await dialog.setProps({ visible: false });
    await dialog.setProps({ visible: true });
    await nextTick();
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      mode: "auto",
      autoSuggestionId: suggestion.id,
    });
  });

  test("retains fixed-width breaks through Back and custom mode changes", async () => {
    const dialog = mountDialog({ sourceRows: [{ row: 0, text: "123456789" }] });
    await switchToFixedWidth();
    const input = dialog.get('[aria-label="Break position"] .t-input__inner');
    await input.setValue("2");
    await byText("button", "Create").trigger("click");
    await input.setValue("5");
    await byText("button", "Create").trigger("click");
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      mode: "fixed-width",
      fixedWidths: [2, 3],
    });

    await next(dialog);
    await dialog.get("[data-split-previous]").trigger("click");
    await byText(".t-radio", "Delimited").trigger("click");
    await byText(".t-radio", "Fixed width").trigger("click");
    expect(dialog.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      mode: "fixed-width",
      fixedWidths: [2, 3],
    });
  });
});
