// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  mindMapLayouts,
  type MindMapDocument,
  type MindMapTopic,
} from "../../../modules/mind-maps/mind-map-document";
import { layoutMindMap } from "../../../modules/mind-maps/mind-map-layout";

type Rectangle = { x: number; y: number; width: number; height: number };
function topic(id: string, children: MindMapTopic[] = [], text = id): MindMapTopic {
  return { id, text, collapsed: false, children };
}
function document(layout: MindMapDocument["layout"]): MindMapDocument {
  return {
    format: "sheetcraft-mindmap",
    version: 1,
    title: "Independent layout",
    layout,
    theme: "green",
    root: topic(
      "root",
      [
        topic(
          "a",
          [topic("a1", [topic("a11")]), topic("a2")],
          "A long topic\nwith several lines\n第三行 🧠",
        ),
        topic("b", [topic("b1", [], "A wide child topic that needs more space")]),
        topic("c"),
        topic("d", [topic("d1"), topic("d2", [], "Two lines\nSecond line")]),
        topic("e"),
      ],
      "Center 🌱",
    ),
  };
}
function visible(topic: MindMapTopic): MindMapTopic[] {
  return [topic, ...(topic.collapsed ? [] : topic.children.flatMap(visible))];
}
function overlap(a: Rectangle, b: Rectangle) {
  const epsilon = 1e-8;
  return (
    a.x < b.x + b.width - epsilon &&
    b.x < a.x + a.width - epsilon &&
    a.y < b.y + b.height - epsilon &&
    b.y < a.y + a.height - epsilon
  );
}
function extent(boxes: Rectangle[]): Rectangle {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}
function expectedLinks(source: MindMapDocument): string[][] {
  const result: string[][] = [];
  function descendants(parent: MindMapTopic) {
    if (parent.collapsed) return;
    for (const child of parent.children) {
      result.push([parent.id, child.id]);
      descendants(child);
    }
  }
  if (source.root.collapsed) return result;
  let previous = source.root;
  for (const child of source.root.children) {
    result.push([
      source.layout === "timeline" || source.layout === "snake" ? previous.id : source.root.id,
      child.id,
    ]);
    descendants(child);
    previous = child;
  }
  return result;
}

describe.each(mindMapLayouts)("mind map %s layout", (layout) => {
  test("keeps visible topic order, connects the intended endpoints, and leaves source data unchanged", () => {
    const source = document(layout);
    const before = structuredClone(source);
    const result = layoutMindMap(source);
    expect(result.boxes.map((box) => box.topic.id)).toEqual(
      visible(source.root).map((node) => node.id),
    );
    expect(result.links.map((link) => [link.from, link.to])).toEqual(expectedLinks(source));
    expect(result.links).toHaveLength(result.boxes.length - 1);
    const ids = new Set(result.boxes.map((box) => box.topic.id));
    for (const link of result.links) {
      expect(ids.has(link.from)).toBe(true);
      expect(ids.has(link.to)).toBe(true);
      expect(link.path).toMatch(/^M /);
      expect(link.path).not.toMatch(/NaN|Infinity|undefined/);
    }
    expect(source).toEqual(before);
  });

  test("places topics and complete sibling subtrees without overlap inside its finite frame", () => {
    const source = document(layout);
    const result = layoutMindMap(source);
    const [x, y, width, height] = result.viewBox.split(" ").map(Number);
    expect([x, y, width, height].every(Number.isFinite)).toBe(true);
    expect(width).toBe(result.width);
    expect(height).toBe(result.height);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    for (const box of result.boxes) {
      expect([box.x, box.y, box.width, box.height].every(Number.isFinite)).toBe(true);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(x!);
      expect(box.y).toBeGreaterThanOrEqual(y!);
      expect(box.x + box.width).toBeLessThanOrEqual(x! + width!);
      expect(box.y + box.height).toBeLessThanOrEqual(y! + height!);
    }
    for (let i = 0; i < result.boxes.length; i++) {
      for (let j = i + 1; j < result.boxes.length; j++) {
        expect(overlap(result.boxes[i]!, result.boxes[j]!)).toBe(false);
      }
    }
    const byId = new Map(result.boxes.map((box) => [box.topic.id, box]));
    for (const parent of visible(source.root)) {
      const siblings = parent.collapsed ? [] : parent.children;
      const subtrees = siblings.map((child) =>
        extent(visible(child).map((node) => byId.get(node.id)!)),
      );
      for (let i = 0; i < subtrees.length; i++) {
        for (let j = i + 1; j < subtrees.length; j++) {
          expect(overlap(subtrees[i]!, subtrees[j]!)).toBe(false);
        }
      }
    }
  });

  test("hides a collapsed topic's descendants and their links while preserving the other branches", () => {
    const source = document(layout);
    source.root.children[0]!.collapsed = true;
    const before = structuredClone(source);
    const result = layoutMindMap(source);
    const ids = result.boxes.map((box) => box.topic.id);
    expect(ids).toContain("a");
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("a11");
    expect(ids).not.toContain("a2");
    expect(ids).toContain("b1");
    expect(result.links.map((link) => [link.from, link.to])).toEqual(expectedLinks(source));
    expect(source).toEqual(before);
  });

  test("renders only the root with no links when the root is collapsed", () => {
    const source = document(layout);
    source.root.collapsed = true;
    const result = layoutMindMap(source);
    expect(result.boxes.map((box) => box.topic.id)).toEqual(["root"]);
    expect(result.links).toEqual([]);
    expect(Number.isFinite(result.width)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
  });
});

test("the eight layout choices position primary topics in their intended directions", () => {
  function boxes(layout: MindMapDocument["layout"]) {
    return new Map(layoutMindMap(document(layout)).boxes.map((box) => [box.topic.id, box]));
  }
  const right = boxes("right");
  expect(right.get("a")!.x).toBeGreaterThan(right.get("root")!.x + right.get("root")!.width);
  const mind = boxes("mind");
  expect(mind.get("a")!.x).toBeGreaterThan(mind.get("root")!.x);
  expect(mind.get("e")!.x + mind.get("e")!.width).toBeLessThan(mind.get("root")!.x);
  const org = boxes("org");
  expect(org.get("a")!.y).toBeGreaterThan(org.get("root")!.y + org.get("root")!.height);
  const tree = boxes("tree");
  expect(tree.get("a")!.x + tree.get("a")!.width).toBeLessThan(tree.get("root")!.x);
  expect(tree.get("b")!.x).toBeGreaterThan(tree.get("root")!.x + tree.get("root")!.width);
  const treeRight = boxes("treeRight");
  for (const id of ["a", "b", "c", "d", "e"])
    expect(treeRight.get(id)!.x).toBeGreaterThan(
      treeRight.get("root")!.x + treeRight.get("root")!.width,
    );
  const fishbone = boxes("fishbone");
  expect(fishbone.get("a")!.y + fishbone.get("a")!.height).toBeLessThan(fishbone.get("root")!.y);
  expect(fishbone.get("b")!.y).toBeGreaterThan(
    fishbone.get("root")!.y + fishbone.get("root")!.height,
  );
  const timeline = boxes("timeline");
  expect(timeline.get("a")!.x).toBeLessThan(timeline.get("b")!.x);
  expect(timeline.get("b")!.x).toBeLessThan(timeline.get("c")!.x);
  const snake = boxes("snake");
  expect(snake.get("a")!.x).toBeLessThan(snake.get("b")!.x);
  expect(snake.get("b")!.x).toBeLessThan(snake.get("c")!.x);
  expect(snake.get("d")!.x).toBeGreaterThan(snake.get("e")!.x);
  expect(snake.get("d")!.y).toBeGreaterThan(snake.get("a")!.y + snake.get("a")!.height);
});
