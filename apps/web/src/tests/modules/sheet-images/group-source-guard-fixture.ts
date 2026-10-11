import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getActiveSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import type { PictureGroup } from "@sheetcraft/core/picture-group";
import { ref } from "vue";
import { vi } from "vitest";

export function picture(id = "picture"): LegacyFloatingImage {
  return {
    id,
    assetId: "asset",
    altText: id,
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
  };
}
export function group(id = "group"): PictureGroup {
  return {
    kind: "picture-group-v1",
    id,
    altText: id,
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 0, y: 0, size: { width: 200, height: 100 } },
      angleDeg: 0,
    },
    members: [
      {
        kind: "grouped-picture-v1",
        id: `${id}-leaf`,
        altText: "Owned source",
        assetId: "asset",
        frame: {
          kind: "group-member-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 0,
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        },
      },
    ],
  };
}
export function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const image = picture();
  const container = group();
  sheet.floatingImages = [image, container];
  const selectedIds = ref([image.id]);
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const asset = {
    id: "asset",
    blob: new Blob(["source"], { type: "image/png" }),
    mimeType: "image/png",
    width: 200,
    height: 100,
  };
  const store = { get: vi.fn(async () => asset), put: vi.fn(async () => {}) };
  return { session, sheet, image, container, selectedIds, execute, store, asset };
}
