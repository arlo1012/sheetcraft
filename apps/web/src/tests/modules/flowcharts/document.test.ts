// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import {
  FLOWCHART_MIME,
  decodeFlowchartAttachment,
  encodeFlowchartAttachment,
  parseFlowchartDocument,
  type FlowchartDocument,
} from "../../../modules/flowcharts/flowchart-document";

function document(): FlowchartDocument {
  return {
    format: "sheetcraft-flowchart",
    version: 1,
    title: "订单审批 🧾",
    nodes: [
      {
        id: "start",
        preset: "flowChartTerminator",
        text: "开始 🚀",
        x: 0,
        y: 0,
        width: 120,
        height: 60,
      },
      {
        id: "review",
        preset: "flowChartDecision",
        text: "审核通过？",
        x: 300,
        y: 200,
        width: 160,
        height: 100,
      },
      {
        id: "finish",
        preset: "flowChartProcess",
        text: "完成 ✅",
        x: 680,
        y: 440,
        width: 120,
        height: 60,
      },
    ],
    edges: [
      { id: "to-review", from: "start", to: "review", label: "提交 📩" },
      { id: "approved", from: "review", to: "finish", label: "是" },
    ],
  };
}

function byteAttachment(bytes: Uint8Array): SheetAttachment {
  return {
    filename: "draft.flowchart.json",
    mimeType: FLOWCHART_MIME,
    size: bytes.length,
    data: btoa(String.fromCharCode(...bytes)),
    display: "document",
  };
}

function textAttachment(text: string): SheetAttachment {
  return byteAttachment(new TextEncoder().encode(text));
}

describe("flowchart source document", () => {
  test("accepts the current format, flowchart presets, and nodes touching each canvas boundary", () => {
    const source = document();
    expect(parseFlowchartDocument(source)).toEqual(source);
  });

  test("allows an empty draft before the separate save-to-sheet validation", () => {
    const source = { ...document(), nodes: [], edges: [] };
    expect(parseFlowchartDocument(source)).toEqual(source);
  });

  test.each([undefined, null, false, 12, "{}", []])("rejects a non-document root %j", (value) => {
    expect(() => parseFlowchartDocument(value)).toThrow();
  });

  test.each([undefined, null, 0, 2, 1.5, "1"])("rejects unsupported version %j", (version) => {
    expect(() => parseFlowchartDocument({ ...document(), version })).toThrow();
  });

  test.each([undefined, "flowchart", "sheetcraft-flowchart-v1"])(
    "rejects format %j without guessing another source format",
    (format) => {
      expect(() => parseFlowchartDocument({ ...document(), format })).toThrow();
    },
  );

  test.each([undefined, null, "", " \t\n ", 123])(
    "rejects an empty or non-text title %j",
    (title) => {
      expect(() => parseFlowchartDocument({ ...document(), title })).toThrow();
    },
  );

  test.each([
    { nodes: undefined },
    { nodes: {} },
    { nodes: [null] },
    { edges: undefined },
    { edges: {} },
    { edges: [null] },
  ])("rejects malformed node or edge collections %j", (patch) => {
    expect(() => parseFlowchartDocument({ ...document(), ...patch })).toThrow();
  });

  test.each([
    ["id", ""],
    ["id", "   "],
    ["id", 4],
    ["preset", "rect"],
    ["preset", "flowChartUnknown"],
    ["text", null],
    ["x", -0.1],
    ["x", NaN],
    ["x", Infinity],
    ["x", "20"],
    ["y", -1],
    ["y", -Infinity],
    ["width", 0],
    ["width", -10],
    ["width", NaN],
    ["width", Infinity],
    ["width", "120"],
    ["height", 0],
    ["height", -10],
    ["height", Infinity],
  ])("rejects the malformed node field %s=%s", (field, value) => {
    const source = document();
    const node = { ...source.nodes[0]!, [field]: value };
    expect(() => parseFlowchartDocument({ ...source, nodes: [node], edges: [] })).toThrow();
  });

  test.each([
    { x: 801 },
    { y: 501 },
    { x: 681, width: 120 },
    { y: 441, height: 60 },
    { x: 0, width: 801 },
    { y: 0, height: 501 },
  ])("rejects nodes extending beyond the 800 by 500 canvas: %j", (patch) => {
    const source = document();
    const node = { ...source.nodes[0]!, ...patch };
    expect(() => parseFlowchartDocument({ ...source, nodes: [node], edges: [] })).toThrow();
  });

  test("rejects duplicate node identities instead of silently replacing an endpoint", () => {
    const source = document();
    const nodes = [...source.nodes, { ...source.nodes[0]!, text: "重复节点" }];
    expect(() => parseFlowchartDocument({ ...source, nodes })).toThrow();
  });

  test("rejects duplicate edge identities", () => {
    const source = document();
    const edges = [...source.edges, { ...source.edges[0]!, to: "finish" }];
    expect(() => parseFlowchartDocument({ ...source, edges })).toThrow();
  });

  test.each([
    { id: "" },
    { id: "  " },
    { id: 1 },
    { from: "missing" },
    { to: "missing" },
    { from: "" },
    { to: null },
    { label: 123 },
  ])("rejects malformed edges or missing endpoints %j", (patch) => {
    const source = document();
    const edges = [{ ...source.edges[0]!, ...patch }];
    expect(() => parseFlowchartDocument({ ...source, edges })).toThrow();
  });

  test("rejects edges in an otherwise empty draft", () => {
    const source = document();
    expect(() => parseFlowchartDocument({ ...source, nodes: [] })).toThrow();
  });

  test("preserves source fields and geometry when validating either a valid or invalid draft", () => {
    const source = document();
    const before = structuredClone(source);
    for (const node of source.nodes) Object.freeze(node);
    for (const edge of source.edges) Object.freeze(edge);
    Object.freeze(source.nodes);
    Object.freeze(source.edges);
    Object.freeze(source);
    expect(parseFlowchartDocument(source)).toEqual(before);
    expect(source).toEqual(before);

    const invalid = { ...before, nodes: [{ ...before.nodes[0]!, x: -20 }], edges: [] };
    const invalidBefore = structuredClone(invalid);
    expect(() => parseFlowchartDocument(invalid)).toThrow();
    expect(invalid).toEqual(invalidBefore);
  });
});

describe("flowchart source attachments", () => {
  test("round trips Chinese and emoji as UTF-8 bytes with the dedicated MIME type", () => {
    const source = document();
    const before = structuredClone(source);
    const attachment = encodeFlowchartAttachment(source);
    const attachmentBefore = structuredClone(attachment);
    expect(FLOWCHART_MIME).toBe("application/vnd.sheetcraft.flowchart+json");
    expect(attachment.mimeType).toBe(FLOWCHART_MIME);

    const bytes = Uint8Array.from(atob(attachment.data), (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    expect(attachment.size).toBe(bytes.length);
    expect(attachment.size).toBe(new TextEncoder().encode(json).length);
    expect(JSON.parse(json)).toEqual(source);
    expect(decodeFlowchartAttachment(attachment)).toEqual(source);
    expect(source).toEqual(before);
    expect(attachment).toEqual(attachmentBefore);
  });

  test("decodes an externally supplied valid flowchart source without rewriting its bytes", () => {
    const source = document();
    const attachment = textAttachment(JSON.stringify(source, null, 2));
    const before = structuredClone(attachment);
    expect(decodeFlowchartAttachment(attachment)).toEqual(source);
    expect(attachment).toEqual(before);
  });

  test.each(["application/json", "text/plain", "application/octet-stream"])(
    "ignores attachment MIME %s even when its source JSON is a valid flowchart",
    (mimeType) => {
      const attachment = { ...textAttachment(JSON.stringify(document())), mimeType };
      const before = structuredClone(attachment);
      expect(decodeFlowchartAttachment(attachment)).toBeUndefined();
      expect(attachment).toEqual(before);
    },
  );

  test.each(["", "{", "null", "[]", '{"format":"sheetcraft-flowchart","version":2}'])(
    "safely ignores damaged or invalid source JSON %j",
    (text) => {
      const attachment = textAttachment(text);
      const before = structuredClone(attachment);
      expect(decodeFlowchartAttachment(attachment)).toBeUndefined();
      expect(attachment).toEqual(before);
    },
  );

  test.each([
    { data: "%%%=", size: 2 },
    { data: "e30=", size: 1 },
    { data: "e30=====", size: 2 },
    { size: -1 },
  ])("safely ignores malformed attachment bytes or metadata %j", (patch) => {
    const attachment = { ...textAttachment(JSON.stringify(document())), ...patch };
    const before = structuredClone(attachment);
    expect(decodeFlowchartAttachment(attachment)).toBeUndefined();
    expect(attachment).toEqual(before);
  });

  test("safely ignores invalid UTF-8 source bytes", () => {
    const attachment = byteAttachment(Uint8Array.from([0xff, 0xfe, 0x80]));
    expect(decodeFlowchartAttachment(attachment)).toBeUndefined();
  });

  test.each(["missing endpoint", "duplicate identity", "off-canvas node"] as const)(
    "safely ignores a source document with %s",
    (problem) => {
      const source = document();
      if (problem === "missing endpoint") source.edges[0]!.to = "missing";
      if (problem === "duplicate identity") source.nodes[1]!.id = source.nodes[0]!.id;
      if (problem === "off-canvas node") source.nodes[0]!.x = 900;
      const attachment = textAttachment(JSON.stringify(source));
      const before = structuredClone(attachment);

      expect(decodeFlowchartAttachment(attachment)).toBeUndefined();
      expect(attachment).toEqual(before);
    },
  );
});
