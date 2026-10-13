import type { WordArtStyleLocale } from "../../wordart-style-presets";

/** Local pane copy, distinct from the Insert gallery's shared choice labels. */
export const WORDART_STYLE_APPLICATION_LABELS = {
  "en-US": {
    title: "WordArt styles",
    reapplyHelp:
      "Choose a preset to replace text fill, outline, shadow, reflection, glow, soft edges and glyph 3-D effects. Text, fonts, size, bold/italic/underline, paragraphs, layout, frame, transform, flips and the shared body camera are kept.",
    selectionMixed:
      "Selected characters have different appearances. The preset applies only to this selection.",
    selectionHelp:
      "Choose a preset to replace only the selected text's fill, outline, shadow, reflection and glow. Fonts, size, bold/italic/underline and the object transform are kept. Applying text saves the same draft.",
    caretHelp:
      "Choose a preset for new text at the caret: fill, outline, shadow, reflection and glow. Existing text and the object transform are kept.",
    mixed:
      "TextBox and WordArt members have different styles. Choose a preset to apply the same style to the eligible members.",
    clear: "Clear WordArt effects",
    clearHelp:
      "Restore black text with no outline or glyph effects and remove the text transform. Fonts, size, bold/italic/underline and the 2-D angle are kept. Existing auto-fit settings still apply.",
  },
  "zh-CN": {
    title: "艺术字样式",
    reapplyHelp:
      "选择预设会替换文字填充、轮廓、阴影、映像、发光、柔化与字形三维效果；保留文字、字体、字号、加粗/倾斜/下划线、段落、布局、外框、转换、翻转及主体共用的三维场景。",
    selectionMixed: "选中文字的外观不同。预设只应用于当前文字选区。",
    selectionHelp:
      "选择预设只替换选中文字的填充、轮廓、阴影、映像与发光；保留字体、字号、加粗/倾斜/下划线及对象转换。应用文字时一并保存同一草稿。",
    caretHelp:
      "选择预设用于光标处新输入文字的填充、轮廓、阴影、映像与发光；已有文字和对象转换保持不变。",
    mixed: "文本框或艺术字成员的样式不同。选择预设会将统一样式应用于符合条件的成员。",
    clear: "清除艺术字效果",
    clearHelp:
      "恢复黑色文字，移除轮廓、字形效果与文字转换；保留字体、字号、加粗/倾斜/下划线及二维角度，仍按原有自动适应设置调整。",
  },
} as const;

export function wordArtStyleApplicationScope(
  locale: WordArtStyleLocale,
  scope: Readonly<{ eligibleCount: number; descendantCount: number }>,
): string {
  return locale === "zh-CN"
    ? `样式与清除操作适用于所选组合中的 ${scope.eligibleCount} 个文本框或艺术字成员（共 ${scope.descendantCount} 个成员）。`
    : `Style and clear apply to ${scope.eligibleCount} TextBox or WordArt members of ${scope.descendantCount} members in the selected group.`;
}
