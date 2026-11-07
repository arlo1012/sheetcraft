// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { importProcessOnFlowchart } from "../../../modules/flowcharts/processon-import";
import {
  decodeFlowchartAttachment,
  encodeFlowchartAttachment,
  parseFlowchartDocument,
} from "../../../modules/flowcharts/flowchart-document";

// Independently invented minimal POS data; no external diagram or real file is copied.
function pos() {
  return {
    meta: {
      type: "ProcessOn Schema File",
      diagramInfo: { category: "flow", title: "示例审核 🧾" },
    },
    diagram: {
      elements: {
        elements: {
          first: {
            id: "submit",
            name: "process",
            props: { x: 100, y: 200, w: 100, h: 60, angle: 0 },
            textBlock: [{ text: "<div><b>订单 &amp; 金额</b><br>😀</div>" }],
            fillStyle: { color: "240,248,255" },
            fontStyle: { color: "18,52,86", size: 16 },
          },
          second: {
            id: "review",
            name: "decision",
            props: { x: 500, y: 400, w: 100, h: 80, angle: 0 },
            textBlock: [{ text: "<span>复核&nbsp;&lt;A&gt;</span>" }, { text: "<i>确认</i>" }],
            fillStyle: { color: "255,240,128" },
            fontStyle: { color: "0,64,128", size: 18 },
          },
          connection: {
            id: "submit-review",
            name: "linker",
            linkerType: "broken",
            from: { id: "submit", x: 200, y: 230 },
            to: { id: "review", x: 500, y: 420 },
            points: [
              { x: 700, y: 150 },
              { x: 700, y: 420 },
            ],
            text: "<b>通过 &amp; 继续</b>",
          },
        },
      },
    },
  };
}

describe("ProcessOn flowchart import", () => {
  test("preserves topology, relative anchors, bend order, plain text, and node colors", () => {
    const source = pos();
    const before = structuredClone(source);
    const result = importProcessOnFlowchart(source);

    expect(result).toEqual({
      format: "sheetcraft-flowchart",
      version: 1,
      title: "示例审核 🧾",
      nodes: [
        {
          id: "submit",
          preset: "flowChartProcess",
          text: "订单 & 金额\n😀",
          x: 100,
          y: 135,
          width: 100,
          height: 60,
          fill: "#f0f8ff",
          color: "#123456",
          fontSize: 16,
        },
        {
          id: "review",
          preset: "flowChartDecision",
          text: "复核 <A>\n确认",
          x: 500,
          y: 335,
          width: 100,
          height: 80,
          fill: "#fff080",
          color: "#004080",
          fontSize: 18,
        },
      ],
      edges: [
        {
          id: "submit-review",
          from: "submit",
          to: "review",
          label: "通过 & 继续",
          route: {
            start: { x: 1, y: 0.5 },
            end: { x: 0, y: 0.25 },
            bends: [
              { x: 700, y: 85 },
              { x: 700, y: 355 },
            ],
          },
        },
      ],
    });
    expect(parseFlowchartDocument(result)).toEqual(result);
    expect(source).toEqual(before);
  });

  test("fits oversized nodes and outlying bends into the canvas using one scale", () => {
    const source = pos();
    const elements = source.diagram.elements.elements;
    for (const node of [elements.first, elements.second]) {
      node.props.x *= 4;
      node.props.y *= 4;
      node.props.w *= 4;
      node.props.h *= 4;
    }
    for (const point of [
      elements.connection.from,
      elements.connection.to,
      ...elements.connection.points,
    ]) {
      point.x *= 4;
      point.y *= 4;
    }
    const before = structuredClone(source);
    const result = importProcessOnFlowchart(source);
    const first = result.nodes[0]!;
    const second = result.nodes[1]!;
    expect(first.x).toBeCloseTo(16);
    expect(first.y).toBeCloseTo(102.8);
    expect(first.width).toBeCloseTo(128);
    expect(first.height).toBeCloseTo(76.8);
    expect(second.x).toBeCloseTo(528);
    expect(second.y).toBeCloseTo(358.8);
    expect(second.width).toBeCloseTo(128);
    expect(second.height).toBeCloseTo(102.4);
    expect(first.fontSize).toBeCloseTo(5.12);
    expect(result.edges[0]!.route!.start).toEqual({ x: 1, y: 0.5 });
    expect(result.edges[0]!.route!.end).toEqual({ x: 0, y: 0.25 });
    expect(result.edges[0]!.route!.bends[0]!.x).toBeCloseTo(784);
    expect(result.edges[0]!.route!.bends[0]!.y).toBeCloseTo(38.8);
    expect(result.edges[0]!.route!.bends[1]!.x).toBeCloseTo(784);
    expect(result.edges[0]!.route!.bends[1]!.y).toBeCloseTo(384.4);
    expect(parseFlowchartDocument(result)).toEqual(result);
    expect(source).toEqual(before);
  });

  test("round trips imported routing, text, and styles through the embedded attachment", () => {
    const result = importProcessOnFlowchart(pos());
    const before = structuredClone(result);
    const attachment = encodeFlowchartAttachment(result);

    expect(decodeFlowchartAttachment(attachment)).toEqual(result);
    expect(result).toEqual(before);
  });

  test.each([
    ["terminator", "flowChartTerminator"],
    ["data", "flowChartInputOutput"],
    ["document", "flowChartDocument"],
  ])("maps the supported %s shape to %s", (name, preset) => {
    const source = pos();
    source.diagram.elements.elements.first.name = name;
    expect(importProcessOnFlowchart(source).nodes[0]!.preset).toBe(preset);
  });

  test.each(["normal", "straight"])("accepts an explicitly supported %s connector", (type) => {
    const source = pos();
    source.diagram.elements.elements.connection.linkerType = type;
    source.diagram.elements.elements.connection.points = [];
    const edge = importProcessOnFlowchart(source).edges[0]!;
    expect(edge.from).toBe("submit");
    expect(edge.to).toBe("review");
    expect(edge.route?.bends).toEqual([]);
  });

  test.each(["ellipse", "customShape", "swimlane", "flowChartProcess"])(
    "rejects the unsupported shape %s instead of substituting another shape",
    (name) => {
      const source = pos();
      source.diagram.elements.elements.first.name = name;
      const before = structuredClone(source);
      expect(() => importProcessOnFlowchart(source)).toThrow();
      expect(source).toEqual(before);
    },
  );

  test.each(["curve", "bezier", "unsupported"])("rejects unsupported %s connectors", (type) => {
    const source = pos();
    source.diagram.elements.elements.connection.linkerType = type;
    expect(() => importProcessOnFlowchart(source)).toThrow();
  });

  test.each(["from", "to"] as const)(
    "rejects the connector when its %s endpoint is missing",
    (end) => {
      const source = pos();
      source.diagram.elements.elements.connection[end].id = "missing-node";
      expect(() => importProcessOnFlowchart(source)).toThrow();
    },
  );

  test.each([
    undefined,
    null,
    [],
    {},
    { meta: null },
    { meta: { type: "Other format", diagramInfo: { category: "flow" } } },
    { meta: { type: "ProcessOn Schema File", diagramInfo: { category: "mindmap" } } },
  ])("rejects malformed or unrelated POS roots %j", (value) => {
    expect(() => importProcessOnFlowchart(value)).toThrow();
  });

  test.each([{ x: NaN }, { y: Infinity }, { w: 0 }, { h: -10 }, { w: "100" }, { angle: 1 }])(
    "rejects malformed or unsupported node geometry %j",
    (patch) => {
      const source = pos();
      const node = source.diagram.elements.elements.first;
      const elements = {
        ...source.diagram.elements.elements,
        first: { ...node, props: { ...node.props, ...patch } },
      };
      expect(() =>
        importProcessOnFlowchart({ ...source, diagram: { elements: { elements } } }),
      ).toThrow();
    },
  );

  test.each([
    { textBlock: null },
    { textBlock: "plain string" },
    { textBlock: [null] },
    { textBlock: [{ text: 123 }] },
    { fontStyle: { color: "0,0,0", size: Infinity } },
  ])("rejects malformed node text or font fields %j", (patch) => {
    const source = pos();
    const elements = {
      ...source.diagram.elements.elements,
      first: { ...source.diagram.elements.elements.first, ...patch },
    };
    expect(() =>
      importProcessOnFlowchart({ ...source, diagram: { elements: { elements } } }),
    ).toThrow();
  });

  test.each([
    { from: null },
    { to: { id: "review", x: NaN, y: 420 } },
    { points: {} },
    { points: [null] },
    { points: [{ x: Infinity, y: 20 }] },
    { text: 123 },
  ])("rejects malformed connector fields %j", (patch) => {
    const source = pos();
    const elements = {
      ...source.diagram.elements.elements,
      connection: { ...source.diagram.elements.elements.connection, ...patch },
    };
    expect(() =>
      importProcessOnFlowchart({ ...source, diagram: { elements: { elements } } }),
    ).toThrow();
  });

  test("rejects duplicate node identities and an empty graph", () => {
    const source = pos();
    source.diagram.elements.elements.second.id = source.diagram.elements.elements.first.id;
    expect(() => importProcessOnFlowchart(source)).toThrow();
    expect(() =>
      importProcessOnFlowchart({ ...pos(), diagram: { elements: { elements: {} } } }),
    ).toThrow();
  });
});
