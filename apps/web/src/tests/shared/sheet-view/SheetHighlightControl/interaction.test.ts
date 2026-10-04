import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetHighlightControl from "../../../../shared/sheet-view/SheetHighlightControl.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});

function mountControl(highlightColor: string) {
  const wrapper = mount(SheetHighlightControl, {
    global: { plugins: [createAppI18n("en-US")] },
    props: { highlightEnabled: true, highlightColor },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("SheetHighlightControl", () => {
  test("keeps the icon readable against the actual button background", async () => {
    const wrapper = mountControl("#0000ff");
    const highlight = wrapper.get<HTMLElement>(".sheet-highlight-control");
    expect(highlight.element.style.getPropertyValue("--highlight-background")).toBe("#CCCCFF");
    expect(highlight.element.style.getPropertyValue("--highlight-foreground")).toBe("#000000");

    await wrapper.setProps({ highlightColor: "#ffdcdb" });
    expect(highlight.element.style.getPropertyValue("--highlight-background")).toBe("#ffdcdb");
    expect(highlight.element.style.getPropertyValue("--highlight-foreground")).toBe("#000000");
  });

  test("offers the two pale shades per hue and enables highlighting on selection", async () => {
    const wrapper = mountControl("#22a06b");
    await wrapper.get('[data-view-control="highlight-color"]').trigger("click");
    const panel = new DOMWrapper(document.body).get(".sheet-highlight-control__color-panel");
    const colors = panel
      .findAll("[data-color-swatch]")
      .map((swatch) => swatch.attributes("data-color-swatch")!);
    expect(colors).toHaveLength(18);
    expect(
      colors.every((color) =>
        [1, 3, 5].every((start) => Number.parseInt(color.slice(start, start + 2), 16) >= 153),
      ),
    ).toBe(true);
    expect(panel.find('[data-color-action="more"]').exists()).toBe(false);
    expect(panel.find('[data-color-action="default"]').exists()).toBe(false);
    expect(panel.find(".color-palette__heading").exists()).toBe(false);

    await panel.get('[data-color-swatch="#ace2c5"]').trigger("click");
    expect(wrapper.emitted("update:highlightColor")).toEqual([["#ace2c5"]]);
    expect(wrapper.emitted("update:highlightEnabled")).toEqual([[true]]);
  });

  test("clears highlighting without replacing the remembered color", async () => {
    const wrapper = mountControl("#ace2c5");
    const trigger = wrapper.get('[data-view-control="highlight-color"]');
    await trigger.trigger("click");
    const panel = new DOMWrapper(document.body).get(".sheet-highlight-control__color-panel");
    await panel.get('[data-color-action="clear"]').trigger("click");

    expect(wrapper.emitted("update:highlightEnabled")).toEqual([[false]]);
    expect(wrapper.emitted("update:highlightColor")).toBeUndefined();
    expect(document.body.querySelector(".sheet-highlight-control__color-panel")).toBeNull();

    await wrapper.setProps({ highlightEnabled: false });
    await trigger.trigger("click");
    expect(document.body.querySelector('[data-color-swatch][aria-checked="true"]')).toBeNull();
  });
});
