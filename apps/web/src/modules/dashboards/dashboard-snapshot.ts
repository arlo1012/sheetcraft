import { createWorkbookEvaluator, type Workbook, type Sheet } from "@sheetcraft/core/workbook";
import { init } from "../charts/chart-runtime";
import { dashboardChartOption } from "./dashboard-chart";
import { dashboardChartData } from "./dashboard-data";
import { dashboardLayout } from "./dashboard-layout";
type SnapshotLabels = { records: string; blank: string; noSource: string };
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
function text(x: number, y: number, value: string, size = 16, color = "#24272c") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="sans-serif">${xml(value)}</text>`;
}
export function dashboardSnapshotSvg(workbook: Workbook, sheet: Sheet, labels: SnapshotLabels) {
  const board = sheet.dashboard!;
  const width = 1200,
    gap = 16,
    cellWidth = (width - 4 * gap) / 3,
    cellHeight = 244;
  const titleHeight = board.showTitle ? 58 : 0;
  const layout = dashboardLayout(board.widgets, 3);
  const rows = Math.max(1, ...layout.map((p) => p.row + p.height));
  const height = titleHeight + (cellHeight + gap) * rows + gap;
  const content: string[] = [];
  const background =
    board.theme === "dark" ? "#192531" : board.theme === "blue" ? "#e9f2fc" : "#f6f7f9";
  content.push(`<rect width="${width}" height="${height}" fill="${background}"/>`);
  if (board.showTitle)
    content.push(
      text(gap, 38, board.title || sheet.name, 24, board.theme === "dark" ? "#fff" : "#17232f"),
    );
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  for (const p of layout) {
    const w = p.widget,
      x = gap + (cellWidth + gap) * p.col,
      y = titleHeight + gap + (cellHeight + gap) * p.row;
    const boxWidth = cellWidth * p.width + gap * (p.width - 1),
      boxHeight = cellHeight * p.height + gap * (p.height - 1);
    content.push(
      `<svg x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}"><rect width="100%" height="100%" rx="5" fill="#fff"/>`,
      text(14, 29, w.title, 17),
    );
    if (w.kind === "text") {
      const maxChars = Math.max(8, Math.floor((boxWidth - 28) / 15));
      let line = 0;
      for (const para of w.text.split("\n")) {
        const chars = Array.from(para);
        for (let i = 0; i < Math.max(1, chars.length); i += maxChars) {
          content.push(text(14, 58 + line++ * 20, chars.slice(i, i + maxChars).join("")));
          if (line * 20 > boxHeight) break;
        }
        if (line * 20 > boxHeight) break;
      }
    } else if (w.source?.range && workbook.sheets.has(w.source.sheetId)) {
      const data = dashboardChartData(
        w,
        evaluator.forSheet!(w.source.sheetId),
        labels.records,
        labels.blank,
      );
      if (w.kind === "number")
        content.push(
          text(
            20,
            boxHeight / 2,
            String(data.series[0]?.values[0] ?? (w.measures[0]?.stat === "records" ? 0 : "—")),
            32,
            "#256bb3",
          ),
        );
      else {
        const chart = init(null, undefined, {
          renderer: "svg",
          ssr: true,
          width: boxWidth - 16,
          height: boxHeight - 52,
        });
        try {
          chart.setOption(dashboardChartOption(w, data, boxWidth - 16, boxHeight - 52));
          content.push('<g transform="translate(8,42)">', chart.renderToSVGString(), "</g>");
        } finally {
          chart.dispose();
        }
      }
    } else content.push(text(14, boxHeight / 2, labels.noSource, 14, "#647181"));
    content.push("</svg>");
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content.join("")}</svg>`,
    width,
    height,
  };
}
export async function dashboardPng(workbook: Workbook, sheet: Sheet, labels: SnapshotLabels) {
  const snapshot = dashboardSnapshotSvg(workbook, sheet, labels);
  const scale = Math.min(1, 8192 / snapshot.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(snapshot.width * scale);
  canvas.height = Math.ceil(snapshot.height * scale);
  const url = URL.createObjectURL(
    new Blob([snapshot.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not export dashboard."))),
        "image/png",
      ),
    );
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
