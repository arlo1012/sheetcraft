import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
function fixture(extra: Record<string, unknown> = {}) {
  const commit = vi.fn((..._args: unknown[]) => ({ accepted: true }));
  const wrapper = mount(NumericField, {
    attachTo: document.body,
    props: {
      value: { kind: "value", value: 2.125 },
      ownerKey: "object-a",
      spec: {
        displayUnit: "pt",
        displayStep: 0.25,
        displayPrecision: 2,
        canonicalBounds: { min: 0, max: 10 },
      },
      label: "Width",
      invalidMessage: "Invalid",
      rejectedMessage: "Rejected",
      staleMessage: "Stale",
      onCommit: commit,
      ...extra,
    },
  });
  wrappers.push(wrapper);
  return { wrapper, commit, input: wrapper.get<HTMLInputElement>("input") };
}
async function key(f: ReturnType<typeof fixture>, name: string, type = "keydown") {
  await f.input.trigger(type, { key: name, code: name });
  await nextTick();
}
describe("standard TDesign InputNumber proof", () => {
  test("existing column adapter and real native semantics", async () => {
    const f = fixture({
      contextAttributes: { "data-shape-text-edit-session": "owner", "aria-controls": "menu" },
    });
    expect(
      f.wrapper
        .find(".t-input-number.sheetcraft-input-number--persistent-controls.t-is-controls-right")
        .exists(),
    ).toBe(true);
    expect(f.wrapper.find(".numeric-field__column").exists()).toBe(false);
    expect(f.input.attributes()).toMatchObject({
      role: "spinbutton",
      inputmode: "decimal",
      "aria-label": "Width",
      "aria-valuetext": "2.13 pt",
      "aria-valuenow": "2.125",
      "aria-valuemin": "0",
      "aria-valuemax": "10",
      "data-shape-text-edit-session": "owner",
      "aria-controls": "menu",
    });
    expect(f.wrapper.get('button[aria-label="Width +"]').attributes("disabled")).toBeUndefined();
    f.input.element.focus();
    f.input.element.blur();
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
  });
  test("invalid/intermediate text survives Enter and blur then corrects once", async () => {
    const f = fixture();
    f.input.element.focus();
    for (const raw of ["-", "oops", "1e"]) {
      await f.input.setValue(raw);
      await key(f, "Enter");
      f.input.element.blur();
      await nextTick();
      expect(f.input.element.value).toBe(raw);
      expect(f.wrapper.get('[role="alert"]').text()).toBe("Invalid");
      expect(f.commit).not.toHaveBeenCalled();
      f.input.element.focus();
    }
    await f.input.setValue("3.756");
    await key(f, "Enter");
    f.input.element.blur();
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 3.756 });
  });
  test("IME Enter and Escape cannot half commit", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.trigger("compositionstart");
    f.input.element.value = "3.75";
    await f.input.trigger("input");
    await key(f, "Enter");
    await key(f, "Escape");
    expect(f.commit).not.toHaveBeenCalled();
    await f.input.trigger("compositionend");
    await key(f, "Enter");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 3.75 });
  });
  test("library step button commits one canonical transaction", async () => {
    const f = fixture();
    await f.wrapper.get('button[aria-label="Width +"]').trigger("click");
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 2.375 });
    f.input.element.blur();
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
  });
  test("repeated keyboard steps are one transaction and wheel is inert", async () => {
    const f = fixture({ value: { kind: "value", value: 2 } });
    f.input.element.focus();
    await key(f, "ArrowUp");
    await key(f, "ArrowUp");
    await key(f, "ArrowUp");
    expect(f.commit).not.toHaveBeenCalled();
    await key(f, "ArrowUp", "keyup");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 2.75 });
    await f.input.trigger("wheel", { deltaY: -80 });
    expect(f.commit).toHaveBeenCalledTimes(1);
  });
  test("rejection keeps raw draft and Escape does not dismiss parent", async () => {
    const f = fixture({ onCommit: () => ({ accepted: false, error: "Command refused" }) });
    const parent = vi.fn();
    document.body.addEventListener("keydown", parent);
    await f.input.setValue("3.75");
    await key(f, "Enter");
    expect(f.input.element.value).toBe("3.75");
    expect(f.wrapper.get('[role="alert"]').text()).toBe("Command refused");
    await key(f, "Escape");
    expect(f.input.element.value).toBe("2.13");
    expect(parent).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", parent);
  });
  test("mixed and readonly are real native states and cannot step", async () => {
    const f = fixture({ value: { kind: "mixed" }, mixedText: "Mixed" });
    expect(f.input.attributes("aria-valuenow")).toBeUndefined();
    expect(f.input.attributes("aria-valuetext")).toBe("Mixed");
    expect(
      f.wrapper.findAll("button").every((b) => (b.element as HTMLButtonElement).disabled),
    ).toBe(true);
    await f.wrapper.setProps({ value: { kind: "value", value: 2 }, readOnly: true });
    f.input.element.focus();
    expect(document.activeElement).toBe(f.input.element);
    expect(f.input.element.readOnly).toBe(true);
    expect(f.input.element.disabled).toBe(false);
    await key(f, "ArrowUp");
    await key(f, "ArrowUp", "keyup");
    expect(f.commit).not.toHaveBeenCalled();
  });
  test("external lease stays stale until Escape and owner switch resets", async () => {
    const f = fixture();
    await f.input.setValue("4.5");
    const replacement = vi.fn((..._args: unknown[]) => ({ accepted: true }));
    await f.wrapper.setProps({ onCommit: replacement, value: { kind: "value", value: 6 } });
    await key(f, "Enter");
    expect(f.input.element.value).toBe("4.5");
    expect(replacement).not.toHaveBeenCalled();
    expect(f.wrapper.get('[role="alert"]').text()).toBe("Stale");
    await key(f, "Escape");
    expect(f.input.element.value).toBe("6");
    await f.input.setValue("7");
    await f.wrapper.setProps({ ownerKey: "object-b", value: { kind: "value", value: 8 } });
    expect(f.input.element.value).toBe("8");
    expect(replacement).not.toHaveBeenCalled();
    await f.input.setValue("8.5");
    await key(f, "Enter");
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 8.5 });
    await f.wrapper.get('button[aria-label="Width +"]').trigger("click");
    expect(replacement).toHaveBeenCalledTimes(2);
    expect(replacement.mock.calls[1]?.[0]).toEqual({ kind: "value", value: 8.75 });
  });
});

test.each([true, false])(
  "composition blur retains actual text and end outside commits once (accepted=%s)",
  async (accepted) => {
    const commit = vi.fn((..._args: unknown[]) =>
      accepted ? { accepted: true as const } : { accepted: false as const, error: "Rejected" },
    );
    const f = fixture({
      onCommit: commit,
      value: { kind: "auto" },
      spec: { displayStep: 1, allowAuto: true },
    });
    f.input.element.focus();
    await f.input.trigger("compositionstart");
    f.input.element.value = "3.75";
    await f.input.trigger("input");
    f.input.element.blur();
    await nextTick();
    expect(f.input.element.value).toBe("3.75");
    expect(commit).not.toHaveBeenCalled();
    expect(f.wrapper.vm.hasPending()).toBe(true);
    await f.input.trigger("compositionend");
    await nextTick();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 3.75 });
    expect(f.input.element.value).toBe("3.75");
    expect(f.wrapper.vm.hasPending()).toBe(!accepted);
    await f.input.trigger("blur");
    expect(commit).toHaveBeenCalledTimes(1);
  },
);

test("owner change during blurred composition retires the old text and cannot write the new owner", async () => {
  const f = fixture();
  f.input.element.focus();
  await f.input.trigger("compositionstart");
  f.input.element.value = "3.75";
  await f.input.trigger("input");
  f.input.element.blur();
  await nextTick();
  const replacement = vi.fn(() => ({ accepted: true }));
  await f.wrapper.setProps({
    ownerKey: "object-b",
    value: { kind: "value", value: 6 },
    onCommit: replacement,
  });
  const current = f.wrapper.get<HTMLInputElement>("input");
  expect(current.element.value).toBe("6");
  expect(current.element).not.toBe(f.input.element);
  await f.input.trigger("compositionend");
  await nextTick();
  expect(f.commit).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
  expect(f.wrapper.vm.hasPending()).toBe(false);
});
