import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, test } from "vitest";
import { createContextMenuPoint, useContextMenu } from "../../../../shared/menu/useContextMenu";

function mountFixture(keyboard = false) {
  const focusCalls: string[] = [];
  const Fixture = defineComponent({
    setup() {
      const trigger = ref<HTMLButtonElement | null>(null);
      const panel = ref<HTMLUListElement | null>(null);
      const open = ref(true);
      const surface = computed(() =>
        panel.value ? { focusFirstItem: () => focusCalls.push("first") } : null,
      );
      const anchor = computed(() =>
        keyboard ? trigger.value : createContextMenuPoint({ clientX: 32, clientY: 48 }),
      );
      useContextMenu({
        anchor,
        panelRef: panel,
        open,
        surfaceRef: surface,
        onDismiss: () => {
          open.value = false;
        },
      });
      return () =>
        h("div", [
          h("button", { ref: trigger, type: "button", "data-trigger": "" }),
          open.value ? h("ul", { ref: panel, "data-menu": "" }) : null,
        ]);
    },
  });
  return { focusCalls, wrapper: mount(Fixture, { attachTo: document.body }) };
}

describe("useContextMenu", () => {
  test("focuses a shared surface when it opens", async () => {
    const { focusCalls, wrapper } = mountFixture();
    await nextTick();

    expect(focusCalls).toEqual(["first"]);
    wrapper.unmount();
  });

  test("returns focus to the keyboard menu trigger after Escape", async () => {
    const { wrapper } = mountFixture(true);
    await wrapper.get("[data-menu]").trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(document.activeElement).toBe(wrapper.get("[data-trigger]").element);
    wrapper.unmount();
  });

  test("creates a zero-sized reference at the pointer location", () => {
    const anchor = createContextMenuPoint({ clientX: 32, clientY: 48 });
    const rect = anchor.getBoundingClientRect();

    expect(rect.x).toBe(32);
    expect(rect.y).toBe(48);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});
