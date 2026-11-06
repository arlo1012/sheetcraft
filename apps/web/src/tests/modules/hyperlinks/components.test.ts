// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Tabs } from "tdesign-vue-next/es/tabs";
import HyperlinkDialog from "../../../modules/hyperlinks/components/HyperlinkDialog.vue";
import type {
  HyperlinkDraft,
  HyperlinkInput,
} from "../../../modules/hyperlinks/useHyperlinksController";
import { createAppI18n } from "../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(draft: Partial<HyperlinkDraft> = {}, locale: "en-US" | "zh-CN" = "en-US") {
  const wrapper = mount(HyperlinkDialog, {
    attachTo: document.body,
    props: {
      draft: {
        target: "",
        displayText: "Report",
        tooltip: "Details",
        hasLink: false,
        canEditDisplay: true,
        ...draft,
      },
      sheets: [
        { id: "current", name: "Sheet1" },
        { id: "report", name: "O'Brien plan" },
      ],
      currentSheetName: "Sheet1",
    },
    global: { plugins: [createAppI18n(locale)] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function input(wrapper: ReturnType<typeof fixture>, name: string) {
  const field = wrapper
    .findAllComponents(Input)
    .find((candidate) => candidate.attributes(`data-hyperlink-${name}`) !== undefined);
  expect(field).toBeDefined();
  return field!;
}
async function setInput(wrapper: ReturnType<typeof fixture>, name: string, value: string) {
  input(wrapper, name).vm.$emit("update:modelValue", value);
  await nextTick();
}
async function selectKind(wrapper: ReturnType<typeof fixture>, kind: "web" | "location" | "email") {
  wrapper.getComponent(Tabs).vm.$emit("update:modelValue", kind);
  await nextTick();
}
function confirm(wrapper: ReturnType<typeof fixture>): HyperlinkInput {
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  return wrapper.emitted("confirm")!.at(-1)![0] as HyperlinkInput;
}

describe("hyperlink dialog", () => {
  test.each([
    ["en-US", ["Web page", "Place in this document", "Email address"]],
    ["zh-CN", ["网页", "本文档中的位置", "电子邮件地址"]],
  ] as const)("localizes the three link categories in %s", (locale, labels) => {
    const wrapper = fixture({}, locale);
    for (const label of labels) expect(wrapper.getComponent(Tabs).text()).toContain(label);
  });

  test("creates a worksheet link with spaces and an escaped apostrophe in its sheet name", async () => {
    const wrapper = fixture();
    await selectKind(wrapper, "location");
    expect(wrapper.getComponent(Select).props("options")).toContainEqual({
      value: "O'Brien plan",
      label: "O'Brien plan",
    });
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "O'Brien plan");
    await setInput(wrapper, "reference", "$B$3");
    expect(confirm(wrapper)).toEqual({
      target: "#'O''Brien plan'!$B$3",
      displayText: "Report",
      tooltip: "Details",
    });
  });

  test.each(["#Annual_Total", "#'O''Brien plan'!Annual_Total", "#'Sheet1'!$B$3"])(
    "preserves original worksheet target %s when only its screen tip changes",
    async (target) => {
      const wrapper = fixture({ target, hasLink: true });
      expect(wrapper.getComponent(Tabs).props("modelValue")).toBe("location");
      await setInput(wrapper, "tooltip", "Updated tip");
      expect(confirm(wrapper)).toEqual({ target, displayText: "Report", tooltip: "Updated tip" });
    },
  );

  test("keeps original mailto spelling and encoding when its email fields are unchanged", async () => {
    const target =
      "MAILTO:person@example.test?cc=copy%40example.test&body=Line%201%0ALine%202&subject=Hello%20world";
    const wrapper = fixture({ target, hasLink: true });
    expect(wrapper.getComponent(Tabs).props("modelValue")).toBe("email");
    expect(input(wrapper, "email").props("modelValue")).toBe("person@example.test");
    expect(input(wrapper, "subject").props("modelValue")).toBe("Hello world");
    await setInput(wrapper, "text", "Email report");
    expect(confirm(wrapper)).toEqual({ target, displayText: "Email report", tooltip: "Details" });
  });

  test("edits an email address and encodes its subject while retaining cc and body", async () => {
    const wrapper = fixture({
      target: "mailto:old@example.test?cc=copy%40example.test&body=Line%201%0ALine%202&subject=Old",
      hasLink: true,
    });
    const subject = "预算 & 计划 + 50% / #1?";
    await setInput(wrapper, "email", "new@example.test");
    await setInput(wrapper, "subject", subject);
    const value = confirm(wrapper);
    const target = new URL(value.target);
    expect(target.protocol).toBe("mailto:");
    expect(target.pathname).toBe("new@example.test");
    expect(target.searchParams.get("subject")).toBe(subject);
    expect(target.searchParams.get("cc")).toBe("copy@example.test");
    expect(target.searchParams.get("body")).toBe("Line 1\nLine 2");
    expect(value.target).not.toContain("预算");
    expect(value.displayText).toBe("Report");
    expect(value.tooltip).toBe("Details");
  });

  test("retains each category's inputs while switching between all three link types", async () => {
    const wrapper = fixture({ target: "https://example.test/original" });
    await setInput(wrapper, "target", "https://example.test/edited?x=1&y=2");
    await selectKind(wrapper, "location");
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "O'Brien plan");
    await setInput(wrapper, "reference", "C7");
    await selectKind(wrapper, "email");
    await setInput(wrapper, "email", "person@example.test");
    await setInput(wrapper, "subject", "季度计划 + review");

    await selectKind(wrapper, "web");
    expect(input(wrapper, "target").props("modelValue")).toBe(
      "https://example.test/edited?x=1&y=2",
    );
    await selectKind(wrapper, "location");
    expect(wrapper.getComponent(Select).props("modelValue")).toBe("O'Brien plan");
    expect(input(wrapper, "reference").props("modelValue")).toBe("C7");
    await selectKind(wrapper, "email");
    expect(input(wrapper, "email").props("modelValue")).toBe("person@example.test");
    expect(input(wrapper, "subject").props("modelValue")).toBe("季度计划 + review");
    expect(new URL(confirm(wrapper).target).searchParams.get("subject")).toBe("季度计划 + review");
  });

  test("keeps formula display text disabled while changing the link category", async () => {
    const wrapper = fixture({ displayText: "2", canEditDisplay: false });
    expect(input(wrapper, "text").props("disabled")).toBe(true);
    expect(wrapper.text()).toContain("existing formula or numeric value will be preserved");
    await selectKind(wrapper, "email");
    await setInput(wrapper, "email", "person@example.test");
    expect(input(wrapper, "text").props("disabled")).toBe(true);
    expect(confirm(wrapper)).toEqual({
      target: "mailto:person@example.test",
      displayText: "2",
      tooltip: "Details",
    });
  });

  test("disables confirmation until the selected category has a target", async () => {
    const wrapper = fixture({ target: "https://example.test" });
    await selectKind(wrapper, "email");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    await setInput(wrapper, "email", "person@example.test");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    await selectKind(wrapper, "location");
    await setInput(wrapper, "reference", "   ");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
  });
});
