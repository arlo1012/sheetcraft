// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
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
      names: ["Annual_Total", "Revenue"],
      recentEmails: ["recent@example.test", "team@example.test"],
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
async function selectKind(
  wrapper: ReturnType<typeof fixture>,
  kind: "web" | "location" | "email" | "cloud",
) {
  await wrapper.get(`[data-hyperlink-kind="${kind}"]`).trigger("click");
}
function mainDialog(wrapper: ReturnType<typeof fixture>) {
  return wrapper.findAllComponents(Dialog)[0]!;
}
async function setTooltip(wrapper: ReturnType<typeof fixture>, value: string) {
  await wrapper.get("[data-hyperlink-tip-button]").trigger("click");
  await setInput(wrapper, "tooltip", value);
  wrapper.findAllComponents(Dialog).at(-1)!.vm.$emit("confirm");
  await nextTick();
}
function confirm(wrapper: ReturnType<typeof fixture>): HyperlinkInput {
  mainDialog(wrapper).vm.$emit("confirm");
  return wrapper.emitted("confirm")!.at(-1)![0] as HyperlinkInput;
}

describe("hyperlink dialog", () => {
  test.each([
    [
      "en-US",
      ["Web or shared file", "Place in this document", "Email address", "Cloud document link"],
    ],
    ["zh-CN", ["网页或共享文件", "本文档中的位置", "电子邮件地址", "云文档链接"]],
  ] as const)("localizes the four link categories in %s", (locale, labels) => {
    const wrapper = fixture({}, locale);
    const categories = wrapper.findAll("[data-hyperlink-kind]");
    expect(categories.map((category) => category.attributes("data-hyperlink-kind"))).toEqual([
      "web",
      "location",
      "email",
      "cloud",
    ]);
    expect(categories.map((category) => category.text())).toEqual(labels);
  });

  test("creates a worksheet link with spaces and an escaped apostrophe in its sheet name", async () => {
    const wrapper = fixture();
    await selectKind(wrapper, "location");
    const sheet = wrapper
      .findAll("[data-hyperlink-sheet]")
      .find((option) => option.attributes("data-hyperlink-sheet") === "O'Brien plan")!;
    expect(sheet.text()).toBe("O'Brien plan");
    await sheet.trigger("click");
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
      expect(wrapper.get('[data-hyperlink-kind="location"]').attributes("aria-selected")).toBe(
        "true",
      );
      await setTooltip(wrapper, "Updated tip");
      expect(confirm(wrapper)).toEqual({ target, displayText: "Report", tooltip: "Updated tip" });
    },
  );

  test("keeps original mailto spelling and encoding when its email fields are unchanged", async () => {
    const target =
      "MAILTO:person@example.test?cc=copy%40example.test&body=Line%201%0ALine%202&subject=Hello%20world";
    const wrapper = fixture({ target, hasLink: true });
    expect(wrapper.get('[data-hyperlink-kind="email"]').attributes("aria-selected")).toBe("true");
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

  test("retains each category's inputs while switching between all four link types", async () => {
    const wrapper = fixture({ target: "https://example.test/original" });
    await setInput(wrapper, "target", "https://example.test/edited?x=1&y=2");
    await selectKind(wrapper, "location");
    await wrapper
      .findAll("[data-hyperlink-sheet]")
      .find((option) => option.attributes("data-hyperlink-sheet") === "O'Brien plan")!
      .trigger("click");
    await setInput(wrapper, "reference", "C7");
    await selectKind(wrapper, "email");
    await setInput(wrapper, "email", "person@example.test");
    await setInput(wrapper, "subject", "季度计划 + review");
    await selectKind(wrapper, "cloud");
    await setInput(wrapper, "cloud", "https://cloud.example.test/shared/report");

    await selectKind(wrapper, "web");
    expect(input(wrapper, "target").props("modelValue")).toBe(
      "https://example.test/edited?x=1&y=2",
    );
    await selectKind(wrapper, "location");
    expect(
      wrapper
        .findAll("[data-hyperlink-sheet]")
        .find((option) => option.attributes("data-hyperlink-sheet") === "O'Brien plan")!
        .attributes("aria-selected"),
    ).toBe("true");
    expect(input(wrapper, "reference").props("modelValue")).toBe("C7");
    await selectKind(wrapper, "email");
    expect(input(wrapper, "email").props("modelValue")).toBe("person@example.test");
    expect(input(wrapper, "subject").props("modelValue")).toBe("季度计划 + review");
    expect(new URL(confirm(wrapper).target).searchParams.get("subject")).toBe("季度计划 + review");
    await selectKind(wrapper, "cloud");
    expect(input(wrapper, "cloud").props("modelValue")).toBe(
      "https://cloud.example.test/shared/report",
    );
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
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: true });
    await setInput(wrapper, "email", "person@example.test");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: false });
    await selectKind(wrapper, "location");
    await setInput(wrapper, "reference", "   ");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: true });
  });

  test("creates a defined-name link from the document locations list", async () => {
    const wrapper = fixture();
    await selectKind(wrapper, "location");
    expect(wrapper.findAll("[data-hyperlink-name]").map((option) => option.text())).toEqual([
      "Annual_Total",
      "Revenue",
    ]);
    await wrapper.get('[data-hyperlink-name="Annual_Total"]').trigger("click");
    expect(confirm(wrapper)).toEqual({
      target: "#Annual_Total",
      displayText: "Report",
      tooltip: "Details",
    });
  });

  test("confirms screen-tip edits in a separate dialog before updating the link draft", async () => {
    const wrapper = fixture({ target: "https://example.test/report" });
    await wrapper.get("[data-hyperlink-tip-button]").trigger("click");
    expect(
      wrapper.findAllComponents(Dialog).filter((dialog) => dialog.props("visible")),
    ).toHaveLength(2);
    expect(input(wrapper, "tooltip").props("modelValue")).toBe("Details");
    await setInput(wrapper, "tooltip", "Quarterly report details");
    expect(confirm(wrapper).tooltip).toBe("Details");
    wrapper.findAllComponents(Dialog).at(-1)!.vm.$emit("confirm");
    await nextTick();
    expect(confirm(wrapper).tooltip).toBe("Quarterly report details");
  });

  test("discards canceled screen-tip edits and reloads the confirmed tip when reopened", async () => {
    const wrapper = fixture({ target: "https://example.test/report" });
    await wrapper.get("[data-hyperlink-tip-button]").trigger("click");
    await setInput(wrapper, "tooltip", "Canceled change");
    wrapper.findAllComponents(Dialog).at(-1)!.vm.$emit("close");
    await nextTick();
    expect(confirm(wrapper).tooltip).toBe("Details");
    await wrapper.get("[data-hyperlink-tip-button]").trigger("click");
    expect(input(wrapper, "tooltip").props("modelValue")).toBe("Details");
  });

  test("reuses an address from the recent-email list", async () => {
    const wrapper = fixture();
    await selectKind(wrapper, "email");
    const recent = wrapper
      .findAll("[data-hyperlink-recent-email]")
      .find(
        (option) => option.attributes("data-hyperlink-recent-email") === "recent@example.test",
      )!;
    expect(recent.text()).toBe("recent@example.test");
    await recent.trigger("click");
    expect(input(wrapper, "email").props("modelValue")).toBe("recent@example.test");
    expect(confirm(wrapper).target).toBe("mailto:recent@example.test");
  });

  test("accepts a secure cloud sharing address and blocks incomplete or insecure targets", async () => {
    const wrapper = fixture();
    await selectKind(wrapper, "cloud");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: true });
    await setInput(wrapper, "cloud", "http://cloud.example.test/shared/report");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: true });
    await setInput(wrapper, "cloud", "https://");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: true });
    await setInput(wrapper, "cloud", "https://cloud.example.test/shared/report?token=abc");
    expect(mainDialog(wrapper).props("confirmBtn")).toMatchObject({ disabled: false });
    expect(confirm(wrapper)).toEqual({
      target: "https://cloud.example.test/shared/report?token=abc",
      displayText: "Report",
      tooltip: "Details",
    });
  });

  test("derives blank display text from the current address until the user supplies text", async () => {
    const wrapper = fixture({ displayText: "" });
    await setInput(wrapper, "target", "https://example.test/first");
    expect(confirm(wrapper).displayText).toBe("https://example.test/first");
    await setInput(wrapper, "target", "https://example.test/second");
    expect(confirm(wrapper).displayText).toBe("https://example.test/second");
    await setInput(wrapper, "text", "My report");
    await setInput(wrapper, "target", "https://example.test/third");
    expect(confirm(wrapper).displayText).toBe("My report");
  });

  test("omits the internal-link prefix when deriving display text for a defined name", async () => {
    const wrapper = fixture({ displayText: "" });
    await selectKind(wrapper, "location");
    await wrapper.get('[data-hyperlink-name="Annual_Total"]').trigger("click");
    expect(confirm(wrapper)).toEqual({
      target: "#Annual_Total",
      displayText: "Annual_Total",
      tooltip: "Details",
    });
  });

  test("keeps existing display text when an existing link's address changes", async () => {
    const wrapper = fixture({
      target: "https://example.test/old",
      displayText: "Existing report title",
      hasLink: true,
    });
    await setInput(wrapper, "target", "https://example.test/new");
    expect(confirm(wrapper).displayText).toBe("Existing report title");
  });
});
