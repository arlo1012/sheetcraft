import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook } from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

async function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  return wrapper;
}

describe("workspace insert entry points", () => {
  test.each([
    { tool: "shape", selector: '[data-insert-tool="shape"]', dialog: ".drawing-editor" },
    {
      tool: "chart",
      selector: '.chart-insert-tools button[aria-label="Column"]',
      dialog: ".chart-editor",
    },
    { tool: "camera", selector: '[data-insert-tool="camera"]', dialog: ".camera-editor" },
  ])("opens the $tool editor from the actual Insert ribbon", async ({ selector, dialog }) => {
    const wrapper = await fixture();
    expect(document.querySelector(dialog)).toBeNull();
    await wrapper.get(selector).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.querySelector(dialog)).not.toBeNull(), {
      timeout: 10000,
    });
  });
});
