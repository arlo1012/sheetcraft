import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive, ref, Teleport } from "vue";
import { expect, test } from "vitest";
import {
  provideNativePopupScope,
  useNativePopupOwnership,
} from "../../../shared/floating/useNativePopupOwnership";

function fixture() {
  const state = reactive({ owner: "book:sheet:object:session", disabled: false, active: true });
  let scope!: ReturnType<typeof provideNativePopupScope>;
  let popup!: ReturnType<typeof useNativePopupOwnership>;
  const Child = defineComponent({
    setup() {
      const root = ref<HTMLElement>();
      popup = useNativePopupOwnership({
        owner: () => state.owner,
        disabled: () => state.disabled,
        root: () => root.value,
      });
      return () =>
        h("div", { ref: root }, [
          h(
            Teleport,
            { to: "body" },
            h("div", { ref: popup.host }, h("button", { "data-option": "" })),
          ),
        ]);
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        scope = provideNativePopupScope({ owner: () => state.owner, active: () => state.active });
        return () => h(Child);
      },
    }),
    { attachTo: document.body },
  );
  const option = document.querySelector<HTMLElement>("[data-option]")!;
  return { state, scope, popup, wrapper, option };
}
test("exact connected native host is owned only while its generation is live", async () => {
  const f = fixture();
  try {
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(f.popup.containsTarget(f.option)).toBe(false);
    const open = f.popup.onVisibleChange.value;
    expect(open(true)).toBe(true);
    expect(f.scope.popupElements()).toEqual([f.popup.host.value]);
    expect(f.scope.containsTarget(f.option)).toBe(true);
    expect(f.scope.containsTarget(outside)).toBe(false);
    expect(f.popup.onVisibleChange.value(false)).toBe(true);
    expect(f.scope.containsTarget(f.option)).toBe(false);
    expect(open(true)).toBe(false);
    expect(f.popup.onVisibleChange.value(true)).toBe(true);
    const old = f.popup.onVisibleChange.value;
    f.state.owner = "book:other-sheet:other-object:session";
    expect(f.popup.visible.value).toBe(false);
    expect(f.scope.containsTarget(f.option)).toBe(false);
    expect(old(true)).toBe(false);
    await nextTick();
  } finally {
    f.wrapper.unmount();
    document.body.replaceChildren();
  }
});
test.each(["disabled", "scope closed", "unmounted"])(
  "%s immediately retires the exact native popup",
  async (reason) => {
    const f = fixture();
    try {
      f.popup.onVisibleChange.value(true);
      const old = f.popup.onVisibleChange.value;
      if (reason === "disabled") f.state.disabled = true;
      else if (reason === "scope closed") f.state.active = false;
      else f.wrapper.unmount();
      expect(f.popup.visible.value).toBe(false);
      expect(f.scope.containsTarget(f.option)).toBe(false);
      expect(old(true)).toBe(false);
      await nextTick();
    } finally {
      if (reason !== "unmounted") f.wrapper.unmount();
      document.body.replaceChildren();
    }
  },
);

test("same-setup controls explicitly register with their own provided scope", async () => {
  const state = reactive({ owner: "pane-owner", active: true });
  let scope!: ReturnType<typeof provideNativePopupScope>;
  let popup!: ReturnType<typeof useNativePopupOwnership>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const root = ref<HTMLElement>();
        scope = provideNativePopupScope({ owner: () => state.owner, active: () => state.active });
        popup = useNativePopupOwnership({
          owner: () => state.owner,
          disabled: () => false,
          root: () => root.value,
          scope,
        });
        return () =>
          h(
            "div",
            { ref: root },
            h(
              Teleport,
              { to: "body" },
              h("div", { ref: popup.host }, h("button", { "data-own-option": "" })),
            ),
          );
      },
    }),
    { attachTo: document.body },
  );
  try {
    const target = document.querySelector("[data-own-option]")!;
    popup.onVisibleChange.value(true);
    expect(scope.containsTarget(target)).toBe(true);
    state.active = false;
    expect(scope.containsTarget(target)).toBe(false);
    expect(popup.visible.value).toBe(false);
    await nextTick();
  } finally {
    wrapper.unmount();
    document.body.replaceChildren();
  }
});

function focusFixture() {
  const state = reactive({
    owner: "book:sheet:command-1",
    focusOwner: "book:sheet:g1:root/path",
    disabled: false,
    inputKey: 0,
    cancelEpoch: 0,
  });
  let popup!: ReturnType<typeof useNativePopupOwnership>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const root = ref<HTMLElement>();
        popup = useNativePopupOwnership({
          owner: () => state.owner,
          disabled: () => state.disabled,
          root: () => root.value,
          focus: {
            owner: () => state.focusOwner,
            input: () => root.value?.querySelector<HTMLInputElement>("input"),
            cancelOnChange: () => state.cancelEpoch,
          },
        });
        return () =>
          h("div", { ref: root }, [
            h("input", {
              key: state.inputKey,
              readonly: true,
              role: "combobox",
              disabled: state.disabled,
            }),
            h(Teleport, { to: "body" }, h("div", { ref: popup.host }, h("button", "Choice"))),
          ]);
      },
    }),
    { attachTo: document.body },
  );
  const input = wrapper.get<HTMLInputElement>("input").element;
  input.focus();
  popup.onVisibleChange.value(true);
  return { state, popup, wrapper, input };
}

test("accepted focus survives a new opaque command epoch and reaches the current same-owner readonly trigger", async () => {
  const f = focusFixture();
  try {
    expect(
      f.popup.acceptChoice(() => {
        f.state.owner = "book:sheet:command-2";
        f.state.inputKey++;
        return true;
      }),
    ).toBe(true);
    await nextTick();
    const current = f.wrapper.get<HTMLInputElement>("input").element;
    expect(current).not.toBe(f.input);
    expect(document.activeElement).toBe(current);
    expect(f.popup.visible.value).toBe(false);
  } finally {
    f.wrapper.unmount();
    document.body.replaceChildren();
  }
});

test.each(["rejected", "owner", "focus", "pointer", "disabled", "unmount"] as const)(
  "%s cancels an accepted native choice focus handoff without changing its apply contract",
  async (boundary) => {
    const f = focusFixture();
    try {
      const elsewhere = document.createElement("input");
      document.body.append(elsewhere);
      let calls = 0;
      const accepted = f.popup.acceptChoice(() => {
        calls++;
        return boundary !== "rejected";
      });
      expect(calls).toBe(1);
      expect(accepted).toBe(boundary !== "rejected");
      f.popup.onVisibleChange.value(false);
      f.input.blur();
      if (boundary === "owner") f.state.focusOwner = "book:other-sheet:g2:other/path";
      if (boundary === "focus") elsewhere.focus();
      if (boundary === "pointer")
        elsewhere.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      if (boundary === "disabled") f.state.disabled = true;
      if (boundary === "unmount") f.wrapper.unmount();
      await nextTick();
      expect(document.activeElement).not.toBe(f.input);
    } finally {
      if (boundary !== "unmount") f.wrapper.unmount();
      document.body.replaceChildren();
    }
  },
);

test("a standalone draft handler boundary cancels accepted native focus without changing the accepted result", async () => {
  const f = focusFixture();
  try {
    expect(f.popup.acceptChoice(() => true)).toBe(true);
    f.popup.onVisibleChange.value(false);
    f.input.blur();
    f.state.cancelEpoch++;
    await nextTick();
    expect(document.activeElement).not.toBe(f.input);
  } finally {
    f.wrapper.unmount();
    document.body.replaceChildren();
  }
});
