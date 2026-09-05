import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import { createAppI18n } from "../../../shared/i18n";

type AssistHandle = {
  handleKeydown(event: KeyboardEvent): boolean;
  canPickReference(): boolean;
  pickReference(
    range: { start: { row: number; column: number }; end: { row: number; column: number } },
    phase: "start" | "update" | "end",
  ): boolean;
  readonly referenceActive: boolean;
};

function mountAssist(value = "=s", composing = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const input = document.createElement("textarea");
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  document.body.append(input);
  const wrapper = mount(FormulaInputAssist, {
    attachTo: host,
    global: { plugins: [createAppI18n("en-US")] },
    props: { value, input, active: true, composing },
  });
  return {
    wrapper,
    input,
    dispose: () => {
      wrapper.unmount();
      host.remove();
      input.remove();
    },
  };
}

describe("FormulaInputAssist", () => {
  test("hides dismissed nested candidates and removes help outside the active formula edit", async () => {
    const fixture = mountAssist("=SUM(s");
    await nextTick();
    expect(document.querySelector('[role="option"]')).not.toBeNull();
    const assist = fixture.wrapper.vm as unknown as AssistHandle;
    expect(assist.handleKeydown(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    await nextTick();
    expect(document.querySelector('[role="option"]')).toBeNull();
    expect(document.querySelector("[data-formula-help]")).not.toBeNull();
    await fixture.wrapper.setProps({ active: false });
    expect(document.querySelector(".formula-input-assist")).toBeNull();
    await fixture.wrapper.setProps({ active: true, composing: true });
    expect(document.querySelector(".formula-input-assist")).toBeNull();
    await fixture.wrapper.setProps({ composing: false, value: "SUM(" });
    expect(document.querySelector(".formula-input-assist")).toBeNull();
    fixture.dispose();
  });

  test("handles completion keys before the owning editor", async () => {
    const fixture = mountAssist();
    await nextTick();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    expect((fixture.wrapper.vm as unknown as AssistHandle).handleKeydown(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.wrapper.emitted("textEdit")).toEqual([[{ value: "=SUM(", caret: 5 }]]);
    fixture.dispose();
  });

  test("does not handle candidates while composing and keeps help after completion", async () => {
    const fixture = mountAssist("=s", true);
    await nextTick();
    expect(
      (fixture.wrapper.vm as unknown as AssistHandle).handleKeydown(
        new KeyboardEvent("keydown", { key: "Enter" }),
      ),
    ).toBe(false);
    await fixture.wrapper.setProps({ composing: false, value: "=SUM(" });
    fixture.input.value = "=SUM(";
    fixture.input.setSelectionRange(5, 5);
    fixture.input.dispatchEvent(new Event("select"));
    await nextTick();
    expect(document.querySelector("[data-formula-help]")?.textContent).toContain("SUM argument 1");
    expect(
      document.querySelector(".formula-input-assist")?.classList.contains("is-help-only"),
    ).toBe(true);
    fixture.dispose();
  });

  test("chooses with pointer without moving focus away from the textarea", async () => {
    const fixture = mountAssist();
    fixture.input.focus();
    await nextTick();
    const option = document.querySelector<HTMLButtonElement>("[data-formula-suggestion='SUM']");
    expect(option).not.toBeNull();
    option?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.activeElement).toBe(fixture.input);
    expect(fixture.wrapper.emitted("textEdit")?.[0]).toEqual([{ value: "=SUM(", caret: 5 }]);
    fixture.dispose();
  });

  test("keeps one replacement span across dragged references and cycles F4", async () => {
    const fixture = mountAssist("=SUM(");
    const assist = fixture.wrapper.vm as unknown as AssistHandle;
    expect(assist.canPickReference()).toBe(true);
    expect(
      assist.pickReference({ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }, "start"),
    ).toBe(true);
    const first = fixture.wrapper.emitted("textEdit")?.at(-1)?.[0] as {
      value: string;
      caret: number;
    };
    await fixture.wrapper.setProps({ value: first.value });
    fixture.input.value = first.value;
    fixture.input.setSelectionRange(first.caret, first.caret);
    expect(
      assist.pickReference({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }, "update"),
    ).toBe(true);
    const second = fixture.wrapper.emitted("textEdit")?.at(-1)?.[0] as {
      value: string;
      caret: number;
    };
    expect(second.value).toBe("=SUM(A1:B2");
    await fixture.wrapper.setProps({ value: second.value });
    fixture.input.value = second.value;
    fixture.input.setSelectionRange(second.caret, second.caret);
    const f4 = new KeyboardEvent("keydown", { key: "F4", cancelable: true });
    expect(assist.handleKeydown(f4)).toBe(true);
    expect(f4.defaultPrevented).toBe(true);
    const f4Edit = fixture.wrapper.emitted("textEdit")?.at(-1)?.[0] as
      | { value: string }
      | undefined;
    expect(f4Edit?.value).toBe("=SUM($A$1:$B$2");
    expect(assist.referenceActive).toBe(true);
    fixture.dispose();
  });

  test("uses the latest emitted source when drag update and end are synchronous", async () => {
    const fixture = mountAssist("=SUM(B1)+2");
    fixture.input.setSelectionRange(6, 6);
    const assist = fixture.wrapper.vm as unknown as AssistHandle;
    expect(
      assist.pickReference({ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }, "start"),
    ).toBe(true);
    expect(
      assist.pickReference({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }, "update"),
    ).toBe(true);
    expect(
      assist.pickReference({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }, "end"),
    ).toBe(true);
    expect(
      (fixture.wrapper.emitted("textEdit")?.at(-1)?.[0] as { value: string } | undefined)?.value,
    ).toBe("=SUM(A1:B2)+2");
    fixture.dispose();
  });
});
