import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
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
  test("adds source references, requests source picking, and renders a rectangular preview", async () => {
    const wrapper = mountDialog();
    expect(dialog().text()).toContain("Will create 2 rows × 2 columns");
    expect(dialog().findAll(".consolidate-dialog__sample-row")).toHaveLength(2);
    await dialog().get(".consolidate-dialog__section-heading button").trigger("click");
    expect(wrapper.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
      sources: ["Sheet1!A1:B2", ""],
    });
    await dialog().findAll('[aria-label="Select range"]')[0]!.trigger("click");
    expect(wrapper.emitted("pickRange")?.at(-1)).toEqual(["sources", 0]);
  });
});
