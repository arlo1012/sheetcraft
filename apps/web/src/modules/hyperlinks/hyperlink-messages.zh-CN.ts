import type { HyperlinkMessageSchema } from "./hyperlink-messages";
export const hyperlinksZhCN = {
  hyperlinks: {
    insert: "超链接",
    edit: "编辑超链接",
    displayText: "显示文字",
    address: "链接地址",
    tooltip: "屏幕提示",
    addressHint:
      "网页或邮箱地址，例如 https://example.com、mailto:name{'@'}example.com；工作表位置，例如 #Sheet1!A1。",
    formulaTextHint: "保留该单元格现有的公式或数值。",
    confirm: "确定",
    cancel: "取消",
    remove: "移除链接",
    invalidTarget: "请输入有效的网页、邮箱地址或工作表位置。",
    unavailableTarget: "找不到链接指向的工作表位置。",
    failed: "无法更新超链接，请重试。",
    open: "打开超链接",
  },
} satisfies HyperlinkMessageSchema;
