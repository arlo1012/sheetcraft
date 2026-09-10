import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import VerticalAlignmentMenu from "../../../../../modules/home-tools/components/VerticalAlignmentMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{
  host: HTMLElement;
  wrapper: { unmount(): void };
}> = [];

function mountMenu(
  state: {
    value: "top" | "middle" | "bottom" | "justify" | "distributed" | undefined;
    mixed: boolean;
  } = {
    value: undefined,
    mixed: false,
  },
  locale: "en-US" | "zh-CN" = "en-US",
  disabled = false,
) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(VerticalAlignmentMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: { state, disabled },
  });
  mountedWrappers.push({ host, wrapper });
  return wrapper;
}

function getMenu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

afterEach(() => {
  for (const { host, wrapper } of mountedWrappers.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe("VerticalAlignmentMenu interaction", () => {
  test("selects an alignment and restores focus to the trigger", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get<HTMLButtonElement>("[data-vertical-alignment-trigger]");

    expect(trigger.attributes()).toMatchObject({
      "aria-label": "Vertical alignment: Align bottom",
      "aria-expanded": "false",
      "aria-haspopup": "menu",
    });
    await trigger.trigger("click");

    const menu = getMenu();
    expect(trigger.attributes("aria-controls")).toBe(menu.attributes("id"));
    expect(menu.findAll('[role="menuitemradio"]')).toHaveLength(5);
    expect(menu.get('[data-vertical-alignment-option="bottom"]').attributes("aria-checked")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(
      menu.get('[data-vertical-alignment-option="bottom"]').element,
    );

    const bottom = menu.get('[data-vertical-alignment-option="bottom"]');
    await bottom.trigger("click");

    expect(wrapper.emitted("applyStyle")?.[0]).toEqual([{ verticalAlign: null }]);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("supports directional entry, Escape, mixed state, and localized labels", async () => {
    const wrapper = mountMenu({ value: "top", mixed: true }, "zh-CN");
    const trigger = wrapper.get<HTMLButtonElement>("[data-vertical-alignment-trigger]");
    expect(trigger.attributes("aria-label")).toBe("垂直对齐，混合");

    await trigger.trigger("keydown", { key: "ArrowUp" });
    const menu = getMenu();
    expect(document.activeElement).toBe(
      menu.get('[data-vertical-alignment-option="distributed"]').element,
    );
    expect(
      menu.findAll('[role="menuitemradio"]').map((item) => item.attributes("aria-checked")),
    ).toEqual(["false", "false", "false", "false", "false"]);
    expect(menu.text()).toContain("顶端对齐");
    expect(menu.text()).toContain("垂直居中");
    expect(menu.text()).toContain("底端对齐");

    await menu.trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(menu.get('[data-vertical-alignment-option="top"]').element);
    await menu.trigger("keydown", { key: "Escape" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(wrapper.emitted("applyStyle")).toBeUndefined();
  });

  test("clears the sparse override for bottom and stays closed when disabled", async () => {
    const wrapper = mountMenu({ value: "bottom", mixed: false });
    const trigger = wrapper.get<HTMLButtonElement>("[data-vertical-alignment-trigger]");
    await trigger.trigger("click");
    await getMenu().get('[data-vertical-alignment-option="bottom"]').trigger("click");
    expect(wrapper.emitted("applyStyle")?.[0]).toEqual([{ verticalAlign: null }]);

    await wrapper.setProps({ disabled: true });
    expect(trigger.element.disabled).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
