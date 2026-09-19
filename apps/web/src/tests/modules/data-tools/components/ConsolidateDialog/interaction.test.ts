import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import ConsolidateDialog from "../../../../../modules/data-tools/components/ConsolidateDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function mountDialog() {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(ConsolidateDialog, {
    attachTo: host,
    props: {
      visible: true,
      selectSourceReference: vi.fn(async () => "Other!$C$1:$C$4"),
      initial: {
        sources: ["Sheet1!A1:B2"],
        destination: "Sheet1!D1",
        function: "sum",
        topRow: false,
        leftColumn: false,
        overwrite: false,
      },
      preview: {
        rows: 2,
        columns: 2,
        sourceCells: 4,
        outputCells: 4,
        numericValues: 4,
        sample: [
          [1, 2],
          [3, 4],
        ],
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function dialog() {
  return new DOMWrapper(document.body).get('[role="dialog"]');
}

describe("ConsolidateDialog", () => {
  test("stages picked references until Add and deletes the selected reference", async () => {
    const wrapper = mountDialog();
    expect(dialog().text()).toContain("Will create 2 rows × 2 columns");
    expect(dialog().findAll(".consolidate-dialog__sample-row")).toHaveLength(2);
    await dialog().get('[aria-label="Select range"]').trigger("click");
    await flushPromises();
    expect(wrapper.props("selectSourceReference")).toHaveBeenCalledWith("Sheet1!A1:B2");
    expect(dialog().findAll('[role="option"]')).toHaveLength(1);
    await dialog().get(".consolidate-dialog__actions button").trigger("click");
    expect(wrapper.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      sources: ["Sheet1!A1:B2", "Other!$C$1:$C$4"],
    });
    await dialog().get(".consolidate-dialog__actions button").trigger("click");
    expect(dialog().findAll('[role="option"]')).toHaveLength(2);
    await dialog().get('[role="listbox"]').trigger("keydown", { key: "Home" });
    await dialog().get('[role="listbox"]').trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      sources: ["Other!$C$1:$C$4"],
    });
  });
  test("offers eleven functions and disables applying an empty reference list", async () => {
    const wrapper = mountDialog();
    expect(
      wrapper
        .getComponent({ name: "TSelect" })
        .props("options")
        .map((option: { value: string }) => option.value),
    ).toEqual([
      "sum",
      "counta",
      "average",
      "max",
      "min",
      "product",
      "count",
      "stdev",
      "stdevp",
      "var",
      "varp",
    ]);
    await dialog().findAll(".consolidate-dialog__actions button")[1]!.trigger("click");
    expect(dialog().findAll('[role="option"]')).toHaveLength(0);
    const apply = dialog()
      .findAll("button")
      .find((button) => button.text() === "Apply")!;
    expect(apply.attributes("disabled")).toBeDefined();
  });
});
