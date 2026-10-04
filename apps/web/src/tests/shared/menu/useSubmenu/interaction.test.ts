import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { useSubmenu } from "../../../../shared/menu/useSubmenu";

const wrappers: ReturnType<typeof mount>[] = [];

function mountFixture() {
  const Fixture = defineComponent({
    setup() {
      const parentOpen = ref(true);
      const trigger = ref<HTMLButtonElement | null>(null);
      const root = ref<HTMLUListElement | null>(null);
      const surface = computed(() =>
        root.value
          ? {
              rootElement: root.value,
              focusFirstItem: () => root.value?.querySelector<HTMLElement>("[data-child]")?.focus(),
            }
          : null,
      );
      const submenu = useSubmenu({
        parentOpen,
        submenuSurfaceRef: surface,
        getAnchor: () => trigger.value,
      });
      return () =>
        h("div", [
          h("button", { ref: trigger, "data-trigger": "" }),
          h(
            "button",
            {
              "data-parent-item": "",
              onKeydown: (event: KeyboardEvent) => submenu.onParentKeydown(event, "child"),
            },
            "Open",
          ),
          submenu.activeSubmenu.value
            ? h(
                "ul",
                {
                  ref: root,
                  "data-submenu": "",
                  onKeydown: submenu.onSubmenuKeydown,
                },
                [h("li", { tabindex: -1, "data-child": "" }, "Child")],
              )
            : null,
          h(
            "button",
            { "data-close-parent": "", onClick: () => (parentOpen.value = false) },
            "Close parent",
          ),
        ]);
    },
  });
  const wrapper = mount(Fixture, { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("useSubmenu", () => {
  test("opens from ArrowRight and focuses the first child", async () => {
    const wrapper = mountFixture();
    await wrapper.get("[data-parent-item]").trigger("keydown", { key: "ArrowRight" });
    await nextTick();

    expect(wrapper.find("[data-submenu]").exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get("[data-child]").element);
  });

  test("closes only the child for Escape and restores its trigger focus", async () => {
    const wrapper = mountFixture();
    await wrapper.get("[data-parent-item]").trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    await wrapper.get("[data-submenu]").trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(wrapper.find("[data-submenu]").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("[data-trigger]").element);
  });

  test("clears an open child when its parent closes", async () => {
    const wrapper = mountFixture();
    await wrapper.get("[data-parent-item]").trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    await wrapper.get("[data-close-parent]").trigger("click");
    await nextTick();

    expect(wrapper.find("[data-submenu]").exists()).toBe(false);
  });
});
