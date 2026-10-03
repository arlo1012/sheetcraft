import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import HyperlinkDialog from "../../../modules/hyperlinks/components/HyperlinkDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

describe("hyperlink dialog", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "renders the email example in %s without interpreting it as an i18n link",
    (locale) => {
      const wrapper = mount(HyperlinkDialog, {
        attachTo: document.body,
        props: {
          draft: { target: "", displayText: "", tooltip: "", hasLink: false, canEditDisplay: true },
        },
        global: { plugins: [createAppI18n(locale)] },
      });
      expect(document.body.textContent).toContain("mailto:name@example.com");
      wrapper.unmount();
      document.body.replaceChildren();
    },
  );
});
