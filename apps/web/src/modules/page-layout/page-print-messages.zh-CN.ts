import type { PagePrintMessageSchema } from "./page-print-messages";

export const pagePrintZhCN = {
  pagePrint: {
    invalidRange: "无法生成打印预览。请检查页面设置，或缩小打印区域（最多 10,000 页）。",
    unsupportedPictures: "打印预览暂不支持图片框架或嵌套图片组合。工作簿未被修改。",
    popupBlocked: "请允许浏览器打开打印窗口。",
    failed: "图片尚未加载完成或打印失败，请稍后重试。",
    title: "打印预览",
    print: "打印",
    previous: "上一页",
    next: "下一页",
    pageOf: "第 {page} 页，共 {count} 页",
    thumbnails: "页面",
    preview: "页面预览",
    close: "关闭打印预览",
  },
} satisfies PagePrintMessageSchema;
