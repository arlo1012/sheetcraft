import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { useCellEditSession } from "../../../../../shared/cell-editing/useCellEditSession";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function mountFormulaBar(
  props: Partial<InstanceType<typeof WorkbookFormulaBar>["$props"]> = {},
  onCommit = vi.fn(() => true),
) {
  const session = useCellEditSession({ onCommit });
  const wrapper = mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue: "",
      editSession: session,
      ...props,
    },
  });
  mounted.push(wrapper);
  return { wrapper, session, onCommit };
}

describe("WorkbookFormulaBar actions", () => {
  test("opens function insertion from fx and the editor from its separate icon", async () => {
    const { wrapper } = mountFormulaBar();

    await wrapper.get("[data-formula-insert-trigger]").trigger("click");
    expect(wrapper.emitted("openInsertFunction")).toEqual([[]]);
    expect(wrapper.emitted("openFormulaEditor")).toBeUndefined();

    await wrapper.get("[data-formula-editor-trigger]").trigger("click");

    expect(wrapper.emitted("openFormulaEditor")).toEqual([[]]);
  });

  test("expands and collapses without committing or changing the shared draft selection", async () => {
    const { wrapper, session, onCommit } = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    await input.trigger("focus");
    await input.setValue("=SUM(A1:B2)");
    input.element.setSelectionRange(5, 8);
    await input.trigger("select");

    await wrapper.get("[data-formula-expand-trigger]").trigger("click");
    expect(input.attributes("rows")).toBe("5");
    expect(session.state.draft).toBe("=SUM(A1:B2)");
    expect(session.state.selection).toEqual({
      start: 5,
      end: 8,
      direction: "none",
    });

    await wrapper.get("[data-formula-expand-trigger]").trigger("click");
    expect(input.attributes("rows")).toBe("1");
    expect(session.state.draft).toBe("=SUM(A1:B2)");
    expect(session.state.selection).toEqual({
      start: 5,
      end: 8,
      direction: "none",
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("renders the controlled preview read-only without changing or committing the draft", async () => {
    const { wrapper, session, onCommit } = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    await input.trigger("focus");
    await input.setValue("=1+2");

    await wrapper.setProps({ previewing: true, previewValue: "3" });
    expect(input.element.value).toBe("3");
    expect(input.attributes("readonly")).toBeDefined();
    expect(session.state.draft).toBe("=1+2");
    expect(onCommit).not.toHaveBeenCalled();

    await input.setValue("99");
    expect(session.state.draft).toBe("=1+2");
    expect(onCommit).not.toHaveBeenCalled();

    await wrapper.setProps({ previewing: false });
    expect(input.element.value).toBe("=1+2");
    expect(session.state.draft).toBe("=1+2");
  });

  test("does not open the formula editor for a protected formula bar", async () => {
    const { wrapper } = mountFormulaBar({ readOnly: true });
    const trigger = wrapper.get<SVGElement>("[data-formula-editor-trigger]");

    expect(trigger.attributes("aria-disabled")).toBe("true");
    await trigger.trigger("click");
    expect(wrapper.emitted("openFormulaEditor")).toBeUndefined();
  });
});
