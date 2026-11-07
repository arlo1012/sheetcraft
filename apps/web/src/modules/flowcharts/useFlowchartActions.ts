import type { FlowchartStart } from "./flowchart-templates";
import { useDiagramActions, type DiagramWorkspace } from "../attachments/useDiagramActions";
import {
  decodeFlowchartAttachment,
  encodeFlowchartAttachment,
  type FlowchartDocument,
} from "./flowchart-document";

export function useFlowchartActions(options: DiagramWorkspace) {
  return useDiagramActions<FlowchartDocument, FlowchartStart>(options, {
    idPrefix: "flowchart",
    gallery: "gallery",
    decode: decodeFlowchartAttachment,
    encode: encodeFlowchartAttachment,
  });
}
