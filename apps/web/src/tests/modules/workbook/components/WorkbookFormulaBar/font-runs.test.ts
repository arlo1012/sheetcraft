import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CellContent } from "@sheetcraft/core/formula";
import { formatCellContentForInput } from "@sheetcraft/core/input";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import FormulaInputAssist from "../../../../../shared/formula-editing/FormulaInputAssist.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import {
  useCellEditSession,
  type CellEditCommit,
} from "../../../../../shared/cell-editing/useCellEditSession";

vi.mock("../../../../../shared/cell-text/font-resources", () => ({
  ensureCellFontResource: vi.fn(async () => undefined),
}));
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.getSelection()?.removeAllRanges();
});
async function fixture(content: CellContent, accept = true) {
  const commits: CellEditCommit[] = [];
  const session = useCellEditSession({
    onCommit: (payload) => {
      commits.push(payload);
      return accept;
    },
  });
  const wrapper = mount(WorkbookFormulaBar, {
    attachTo: document.body,
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      sheetId: "sheet-1",
      inputValue: formatCellContentForInput(content),
      content,
      editSession: session,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, session, commits };
}
describe("formula bar character-font edits", () => {
  test("Text-format plain literals do not invoke formula completion", async () => {
    const { wrapper, session, commits } = await fixture({ kind: "literal", value: "=SU" });
    await wrapper.setProps({ asText: true });
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    await input.trigger("focus");
    await input.setValue("=SU");
    expect(session.state.asText).toBe(true);
    expect(wrapper.getComponent(FormulaInputAssist).props("active")).toBe(false);
    await input.trigger("keydown", { key: "Tab" });
    expect(commits.at(-1)?.input).toBe("=SU");
  });
  test("renders escaped literal fonts in projected coordinates without styling the escape token", async () => {
    const { wrapper, session } = await fixture({
      kind: "literal",
      value: "=A1",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Noto Sans Math" }],
    });
    const input = wrapper.get<HTMLElement>("[data-formula-input]");
    expect(input.element).toBeInstanceOf(HTMLDivElement);
    expect(input.element.textContent).toBe("'=A1");
    expect(input.findAll("span").map((span) => span.text())).toEqual(["="]);
    await input.trigger("focus");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
  });
  test("a rejected same-value font edit retains its draft and Escape restores the source", async () => {
    const content = {
      kind: "literal" as const,
      value: "aΩb",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
    };
    const { wrapper, session, commits } = await fixture(content, false);
    const input = wrapper.get("[data-formula-input]");
    await input.trigger("focus");
    session.setSelection(1, 2);
    session.replaceSelection("Ω", "Noto Sans Symbols 2", {
      preserveLiteral: true,
      preserveTypingFont: true,
    });
    await flushPromises();
    await input.trigger("keydown", { key: "Enter" });
    expect(commits).toHaveLength(1);
    expect(commits[0]?.inputFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Symbols 2" },
    ]);
    expect(session.state.active).toBe(true);
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.draftFontRuns).toEqual(commits[0]?.inputFontRuns);
    expect(wrapper.emitted("traverse")).toBeUndefined();
    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(session.state.active).toBe(false);
    expect(wrapper.get("[data-formula-input]").find("span").element.style.fontFamily).toContain(
      "Noto Sans Math",
    );
    expect(content.fontRuns[0]?.fontFamily).toBe("Noto Sans Math");
  });
  test("actual formula source stays on the existing textarea and has no character-font editor", async () => {
    const { wrapper } = await fixture({ kind: "formula", formula: { source: "=A1+1" } });
    expect(wrapper.get("[data-formula-input]").element).toBeInstanceOf(HTMLTextAreaElement);
    expect(wrapper.find('[contenteditable="plaintext-only"]').exists()).toBe(false);
  });
});
