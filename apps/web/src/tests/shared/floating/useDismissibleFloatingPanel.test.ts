import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, test } from "vitest";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";

function mountFixture() {
  const dismissals: Array<{ reason: string; restoreFocus: boolean }> = [];
  const Fixture = defineComponent({
    setup() {
      const trigger = ref<HTMLButtonElement | null>(null);
      const panel = ref<HTMLElement | null>(null);
      const open = ref(true);
      useDismissibleFloatingPanel(trigger, panel, open, {
        onDismiss: (payload) => {
          dismissals.push(payload);
          open.value = false;
        },
      });
      return () =>
        h("div", [
          h("button", { ref: trigger, type: "button", "data-trigger": "" }),
          open.value ? h("div", { ref: panel, tabindex: -1, "data-panel": "" }) : null,
        ]);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  return { dismissals, host, wrapper: mount(Fixture, { attachTo: host }) };
}

describe("useDismissibleFloatingPanel", () => {
  test("Escape closes only the latest panel and leaves the parent available", async () => {
    const parent = mountFixture();
    const child = mountFixture();
    try {
      await child.wrapper.get("[data-panel]").trigger("keydown", { key: "Escape" });
      await nextTick();
      expect(child.dismissals).toEqual([{ reason: "escape", restoreFocus: true }]);
      expect(parent.dismissals).toEqual([]);

      await parent.wrapper.get("[data-panel]").trigger("keydown", { key: "Escape" });
      expect(parent.dismissals).toEqual([{ reason: "escape", restoreFocus: true }]);
    } finally {
      child.wrapper.unmount();
      parent.wrapper.unmount();
      child.host.remove();
      parent.host.remove();
    }
  });

  test("ignores Escape consumed by an inner control and unregisters an unmounted panel", async () => {
    const parent = mountFixture();
    const child = mountFixture();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    child.wrapper.get("[data-panel]").element.dispatchEvent(event);
    expect(parent.dismissals).toEqual([]);
    expect(child.dismissals).toEqual([]);
    child.wrapper.unmount();
    child.host.remove();

    await parent.wrapper.get("[data-panel]").trigger("keydown", { key: "Escape" });
    expect(parent.dismissals).toEqual([{ reason: "escape", restoreFocus: true }]);
    parent.wrapper.unmount();
    parent.host.remove();
  });

  test("arms outside-focus dismissal only after focus enters the panel", async () => {
    const { dismissals, host, wrapper } = mountFixture();

    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await nextTick();
    expect(dismissals).toEqual([]);

    await wrapper.get("[data-panel]").trigger("focusin");
    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await nextTick();
    expect(dismissals).toEqual([{ reason: "outside-focus", restoreFocus: false }]);

    wrapper.unmount();
    host.remove();
  });

  test("dismisses on outside pointer and restores trigger focus for Escape", async () => {
    const { dismissals, host, wrapper } = mountFixture();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(dismissals).toEqual([{ reason: "outside-pointer", restoreFocus: false }]);

    await wrapper.unmount();
    host.remove();

    const second = mountFixture();
    await second.wrapper.get("[data-panel]").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(second.dismissals).toEqual([{ reason: "escape", restoreFocus: true }]);
    expect(document.activeElement).toBe(second.wrapper.get("[data-trigger]").element);
    second.wrapper.unmount();
    second.host.remove();
  });
});
