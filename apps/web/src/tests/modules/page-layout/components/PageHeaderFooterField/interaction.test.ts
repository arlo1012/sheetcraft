import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import { describe, expect, test } from "vitest";
import PageHeaderFooterField from "../../../../../modules/page-layout/components/PageHeaderFooterField.vue";
import PageHeaderFooterToolbar from "../../../../../modules/page-layout/components/PageHeaderFooterToolbar.vue";
import type {
  HeaderFooterActionRequest,
  HeaderFooterEditContext,
} from "../../../../../modules/page-layout/header-footer-editor";
import { createAppI18n } from "../../../../../shared/i18n";

function mountField(value = "Report &P / &N - &A &&") {
  return mount(PageHeaderFooterField, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      value,
      section: "header",
      part: "center",
      pageNumber: 2,
      pageCount: 4,
      sheetName: "Sales",
      disabled: false,
    },
  });
}

async function edit(wrapper: ReturnType<typeof mountField>) {
  await wrapper.get("button").trigger("click");
  await nextTick();
  return wrapper.get<HTMLTextAreaElement>("textarea");
}

describe("PageHeaderFooterField", () => {
  test("keeps Enter as a line break and saves on Ctrl+Enter", async () => {
    const wrapper = mountField();
    try {
      const input = await edit(wrapper);
      expect(input.element.value).toBe("Report &[Page] / &[Pages] - &[Sheet name] &");
      await input.setValue("Summary\n&[Page] / &[Pages]");
      await input.trigger("keydown", { key: "Enter", code: "Enter" });
      expect(wrapper.emitted("change")).toBeUndefined();
      await input.trigger("keydown", { key: "Enter", code: "Enter", ctrlKey: true });
      expect(wrapper.emitted("change")).toEqual([['&"Arial,Regular"&10&K000000Summary\n&P / &N']]);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("Escape discards the draft and untouched mixed formatting stays raw", async () => {
    const raw = '&"Calibri,Bold"&12&Kff0000Title &P';
    const wrapper = mountField(raw);
    try {
      const input = await edit(wrapper);
      expect(input.element.value).toBe("Title &[Page]");
      await input.trigger("keydown", { key: "Escape", code: "Escape" });
      expect(wrapper.emitted("change")).toBeUndefined();
      expect(wrapper.get("button").text()).toBe("Title 2");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("inserts a field at the captured caret and applies toolbar formatting", async () => {
    const wrapper = mountField("Title");
    try {
      const input = await edit(wrapper);
      input.element.setSelectionRange(5, 5);
      await input.trigger("select");
      await wrapper.setProps({
        actionRequest: { sequence: 1, action: { type: "insertField", field: "pageNumber" } },
      });
      expect(input.element.value).toBe("Title&[Page]");
      await wrapper.setProps({
        actionRequest: {
          sequence: 2,
          action: { type: "format", patch: { bold: true, fontSize: 14 } },
        },
      });
      await wrapper.setProps({ actionRequest: { sequence: 3, action: { type: "finish" } } });
      expect(wrapper.emitted("change")).toEqual([['&"Arial,Bold"&14&K000000Title&P']]);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("focuses the textarea and keeps the edit context through a toolbar click", async () => {
    const Host = defineComponent({
      setup() {
        const context = ref<HeaderFooterEditContext>();
        const request = ref<HeaderFooterActionRequest>();
        let sequence = 0;
        return () =>
          h("div", [
            h(PageHeaderFooterField, {
              value: "Title",
              section: "header",
              part: "center",
              pageCount: 1,
              sheetName: "Sales",
              disabled: false,
              actionRequest: request.value,
              onEdit: (value: HeaderFooterEditContext | undefined) => {
                context.value = value;
              },
            }),
            h(PageHeaderFooterToolbar, {
              setup: DEFAULT_SHEET_PAGE_SETUP,
              context: context.value,
              disabled: false,
              onAction: (action: HeaderFooterActionRequest["action"]) => {
                request.value = { sequence: ++sequence, action };
              },
            }),
          ]);
      },
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      const field = wrapper.getComponent(PageHeaderFooterField);
      await field.get("button").trigger("click");
      await nextTick();
      const input = field.get<HTMLTextAreaElement>("textarea");
      expect(document.activeElement).toBe(input.element);
      const bold = wrapper.get('[aria-label="Bold"]');
      (bold.element as HTMLElement).focus();
      await input.trigger("blur", { relatedTarget: bold.element });
      await bold.trigger("click");
      await nextTick();
      expect(field.find("textarea").exists()).toBe(true);
      await field.get("textarea").trigger("keydown", { key: "Enter", ctrlKey: true });
      expect(field.emitted("change")).toEqual([['&"Arial,Bold"&10&K000000Title']]);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("does not flush an active IME composition", async () => {
    const wrapper = mountField();
    try {
      const input = await edit(wrapper);
      await input.trigger("compositionstart");
      expect((wrapper.vm as unknown as { finishEditing: () => boolean }).finishEditing()).toBe(
        false,
      );
      await input.trigger("compositionend");
      expect((wrapper.vm as unknown as { finishEditing: () => boolean }).finishEditing()).toBe(
        true,
      );
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
