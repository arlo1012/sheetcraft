import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { useMenu } from "../../../../shared/menu/useMenu";

type FocusMode = "first" | "last" | "selected" | "menu";

const wrappers: ReturnType<typeof mount>[] = [];

function mountFixture(options?: {
  defaultFocus?: FocusMode;
  pointerFocus?: FocusMode;
  selectedDisabled?: boolean;
}) {
  const focusCalls: string[] = [];
  const Fixture = defineComponent({
    setup() {
      const trigger = ref<HTMLButtonElement | null>(null);
      const root = ref<HTMLUListElement | null>(null);
      const menuSurface = computed(() =>
        root.value
          ? {
              rootElement: root.value,
              focusFirstItem: () => focusCalls.push("first"),
              focusLastItem: () => focusCalls.push("last"),
            }
          : null,
      );
      const { open, openMenu, toggleMenu, onTriggerKeydown } = useMenu({
        triggerRef: trigger,
        menuSurfaceRef: menuSurface,
        defaultFocus: options?.defaultFocus,
        pointerFocus: options?.pointerFocus,
      });
      return () =>
        h("div", [
          h("button", {
            ref: trigger,
            type: "button",
            "data-trigger": "",
            onClick: toggleMenu,
            onKeydown: onTriggerKeydown,
          }),
          open.value
            ? h("ul", { ref: root, "data-menu": "" }, [
                h("li", { role: "menuitem", tabindex: -1, "data-first": "" }),
                h("li", {
                  role: "menuitemradio",
                  tabindex: -1,
                  "aria-checked": "true",
                  "aria-disabled": options?.selectedDisabled ? "true" : undefined,
                  "data-selected": "",
                }),
              ])
            : null,
          h("button", {
            type: "button",
            "data-open-selected": "",
            onClick: () => openMenu("selected"),
          }),
        ]);
    },
  });
  const wrapper = mount(Fixture, { attachTo: document.body });
  wrappers.push(wrapper);
  return { wrapper, focusCalls };
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("useMenu", () => {
  test("focuses the first and last items from disclosure keys", async () => {
    const { wrapper, focusCalls } = mountFixture();
    await wrapper.get("[data-trigger]").trigger("keydown", { key: "ArrowDown" });
    await nextTick();
    expect(focusCalls).toEqual(["first"]);

    await wrapper.get("[data-trigger]").trigger("keydown", { key: "ArrowUp" });
    await nextTick();
    expect(focusCalls).toEqual(["first", "last"]);
  });

  test("focuses the checked item when requested", async () => {
    const { wrapper } = mountFixture();
    await wrapper.get("[data-open-selected]").trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get("[data-selected]").element);
  });

  test("uses pointer focus for pointer activation", async () => {
    const { wrapper, focusCalls } = mountFixture({ pointerFocus: "menu" });
    wrapper
      .get("[data-trigger]")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await nextTick();

    expect(focusCalls).toEqual([]);
    expect(document.activeElement).toBe(wrapper.get("[data-menu]").element);
    expect(wrapper.get("[data-menu]").attributes("tabindex")).toBe("-1");
  });

  test("uses the default focus for keyboard and synthetic click activation", async () => {
    const { wrapper } = mountFixture({ defaultFocus: "selected" });
    wrapper
      .get("[data-trigger]")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await nextTick();

    expect(document.activeElement).toBe(wrapper.get("[data-selected]").element);
  });

  test("falls back to the first item when the selected item is disabled", async () => {
    const { wrapper, focusCalls } = mountFixture({ selectedDisabled: true });
    await wrapper.get("[data-open-selected]").trigger("click");
    await nextTick();

    expect(focusCalls).toEqual(["first"]);
  });

  test("does not move focus after the menu closes before its next tick", async () => {
    const { wrapper, focusCalls } = mountFixture();
    const trigger = wrapper.get("[data-trigger]");
    trigger.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    trigger.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await nextTick();

    expect(focusCalls).toEqual([]);
  });
});
