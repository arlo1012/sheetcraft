import type { AppLocale } from "../../shared/i18n";
import type { FlowchartDocument, FlowchartNode } from "./flowchart-document";

export type FlowchartStart = "gallery" | "local" | "blank" | "import";
export type FlowchartTemplate = "blank" | "basic" | "approval";
export function createFlowchartTemplate(
  template: FlowchartTemplate,
  locale: AppLocale,
): FlowchartDocument {
  const zh = locale === "zh-CN";
  const source: FlowchartDocument = {
    format: "sheetcraft-flowchart",
    version: 1,
    title:
      template === "approval"
        ? zh
          ? "审批流程"
          : "Approval process"
        : template === "basic"
          ? zh
            ? "基本流程"
            : "Basic process"
          : zh
            ? "空白流程图"
            : "Blank flowchart",
    nodes: [],
    edges: [],
  };
  function node(id: string, preset: FlowchartNode["preset"], text: string, x: number, y: number) {
    source.nodes.push({ id, preset, text, x, y, width: 160, height: 66 });
  }
  function connect(from: string, to: string, label = "") {
    source.edges.push({ id: from + "-" + to, from, to, label });
  }
  if (template === "blank") return source;
  node("start", "flowChartTerminator", zh ? "开始" : "Start", 320, 30);
  node(
    "process",
    "flowChartProcess",
    template === "approval" ? (zh ? "提交申请" : "Submit request") : zh ? "处理" : "Process",
    320,
    145,
  );
  connect("start", "process");
  if (template === "basic") {
    node("end", "flowChartTerminator", zh ? "结束" : "End", 320, 260);
    connect("process", "end");
  } else {
    node("decision", "flowChartDecision", zh ? "批准？" : "Approved?", 320, 260);
    node("revise", "flowChartProcess", zh ? "修改申请" : "Revise request", 575, 260);
    node("end", "flowChartTerminator", zh ? "完成" : "Complete", 320, 385);
    connect("process", "decision");
    connect("decision", "end", zh ? "是" : "Yes");
    connect("decision", "revise", zh ? "否" : "No");
    connect("revise", "process");
  }
  return source;
}
