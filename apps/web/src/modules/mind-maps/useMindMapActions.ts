import { useDiagramActions, type DiagramWorkspace } from "../attachments/useDiagramActions";
import {
  encodeMindMapAttachment,
  decodeMindMapAttachment,
  type MindMapDocument,
  type MindMapStart,
} from "./mind-map-document";
import { layoutMindMap } from "./mind-map-layout";

export function useMindMapActions(workspace: DiagramWorkspace) {
  return useDiagramActions<MindMapDocument, MindMapStart>(workspace, {
    idPrefix: "mind-map",
    gallery: "workbook",
    encode: encodeMindMapAttachment,
    decode: decodeMindMapAttachment,
    frame(document) {
      const { width, height } = layoutMindMap(document);
      const scale = Math.min(1, 560 / width, 360 / height);
      return {
        width: Math.max(30, Math.round(width * scale)),
        height: Math.max(30, Math.round(height * scale)),
      };
    },
  });
}
