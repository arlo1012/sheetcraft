import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import WorkbookViewControls from "../../../../../modules/workbook/components/WorkbookViewControls.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});

function mountControls(highlightColor: string) {
  const wrapper = mount(WorkbookViewControls, {
    global: { plugins: [createAppI18n("en-US")] },
    props: { highlightEnabled: true, highlightColor },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("WorkbookViewControls highlight color", () => {
  test("keeps the icon readable against the actual button background", async () => {
    const wrapper = mountControls("#0000ff");
    const highlight = wrapper.get<HTMLElement>(".workbook-view-controls__highlight");
    expect(highlight.element.style.getPropertyValue("--highlight-background")).toBe("#CCCCFF");
    expect(highlight.element.style.getPropertyValue("--highlight-foreground")).toBe("#000000");

    await wrapper.setProps({ highlightColor: "#fbd8d6" });
    expect(highlight.element.style.getPropertyValue("--highlight-background")).toBe("#fbd8d6");
    expect(highlight.element.style.getPropertyValue("--highlight-foreground")).toBe("#000000");
  });

  test("offers only pale highlight colors and a pale default", async () => {
    const wrapper = mountControls("#22a06b");
    await wrapper.get('[data-view-control="highlight-color"]').trigger("click");
    const panel = new DOMWrapper(document.body).get(".workbook-view-controls__color-panel");
    const colors = panel
      .findAll("[data-color-swatch]")
      .map((swatch) => swatch.attributes("data-color-swatch")!);
    expect(colors).toHaveLength(10);
    expect(
      colors.every((color) =>
        [1, 3, 5].every((start) => Number.parseInt(color.slice(start, start + 2), 16) >= 204),
      ),
    ).toBe(true);
    expect(panel.find('[data-color-action="more"]').exists()).toBe(false);

    await panel.get('[data-color-action="default"]').trigger("click");
    expect(wrapper.emitted("update:highlightColor")).toEqual([["#d3eee1"]]);
    expect(wrapper.emitted("update:highlightEnabled")).toEqual([[true]]);
  });
});
