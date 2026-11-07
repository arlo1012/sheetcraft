import type { MindMapDocument, MindMapTopic } from "./mind-map-document";

type Box = { topic: MindMapTopic; x: number; y: number; width: number; height: number };
type Link = { from: string; to: string; path: string };

const gap = 52,
  spacing = 20;
function box(topic: MindMapTopic): Box {
  const size = topic.fontSize ?? 15;
  const lengths = topic.text
    .split("\n")
    .map((line) =>
      Array.from(line).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? size : size * 0.55), 0),
    );
  const width = Math.min(220, Math.max(80, 26 + Math.max(0, ...lengths)));
  const lines = lengths.reduce((sum, n) => sum + Math.max(1, Math.ceil(n / (width - 24))), 0);
  return { topic, x: 0, y: 0, width, height: Math.max(40, Math.min(lines, 8) * size * 1.25 + 16) };
}
function bounds(boxes: Box[]) {
  const left = Math.min(...boxes.map((b) => b.x)),
    top = Math.min(...boxes.map((b) => b.y));
  return {
    left,
    top,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - top,
  };
}
function children(n: MindMapTopic) {
  return n.collapsed ? [] : n.children;
}

// Lay out each branch relative to its root. Keeping links as endpoints until the
// final pass allows whole subtrees to move without changing their internal paths.
type Tree = { boxes: Box[]; pairs: [Box, Box][] };
function shift(tree: Tree, x: number, y: number) {
  for (const b of tree.boxes) {
    b.x += x;
    b.y += y;
  }
}
function branch(n: MindMapTopic, vertical: boolean, sign: number, kids = children(n)): Tree {
  const parent = box(n),
    tree: Tree = { boxes: [parent], pairs: [] };
  const subtrees = kids.map((child) => branch(child, vertical, sign));
  const extents = subtrees.map((t) => bounds(t.boxes));
  let offset =
    ((vertical ? parent.width : parent.height) -
      extents.reduce((sum, b) => sum + (vertical ? b.width : b.height), 0) -
      Math.max(0, kids.length - 1) * spacing) /
    2;
  subtrees.forEach((sub, i) => {
    const b = extents[i]!,
      child = sub.boxes[0]!;
    if (vertical) shift(sub, offset - b.left, sign > 0 ? parent.height + gap : -gap - child.height);
    else shift(sub, sign > 0 ? parent.width + gap : -gap - child.width, offset - b.top);
    offset += (vertical ? b.width : b.height) + spacing;
    tree.boxes.push(...sub.boxes);
    tree.pairs.push([parent, child], ...sub.pairs);
  });
  return tree;
}
function doubleSided(root: MindMapTopic) {
  const kids = children(root);
  const middle = Math.ceil(kids.length / 2);
  const right = branch(root, false, 1, kids.slice(0, middle)),
    left = branch(root, false, -1, kids.slice(middle));
  return {
    boxes: [...right.boxes, ...left.boxes.slice(1)],
    pairs: [...right.pairs, ...left.pairs],
  };
}
// In a hanging tree, primary topics share one backbone below the root.
function hangingTree(root: MindMapTopic, bothSides: boolean): Tree {
  const center = box(root),
    tree: Tree = { boxes: [center], pairs: [] };
  const offsets = [center.height + gap, center.height + gap];
  children(root).forEach((n, i) => {
    const left = bothSides && i % 2 === 0;
    const side = left ? 0 : 1;
    const sub = branch(n, false, left ? -1 : 1),
      extent = bounds(sub.boxes);
    const child = sub.boxes[0]!;
    shift(sub, center.width / 2 + (left ? -gap - child.width : gap), offsets[side]! - extent.top);
    offsets[side]! += extent.height + spacing;
    tree.boxes.push(...sub.boxes);
    tree.pairs.push([center, child], ...sub.pairs);
  });
  return tree;
}
function sequence(root: MindMapTopic, fishbone: boolean, snake: boolean): Tree {
  const center = box(root),
    tree: Tree = { boxes: [center], pairs: [] };
  const kids = children(root);
  let x = fishbone ? -gap : center.width + gap,
    y = 0,
    rowBottom = center.height;
  let previous = center;
  const columns = 3;
  let groupStart = 0;
  while (groupStart < kids.length) {
    const count = snake ? Math.min(columns, kids.length - groupStart) : kids.length;
    const reverse = snake && Math.floor(groupStart / columns) % 2 === 1;
    const parts = kids
      .slice(groupStart, groupStart + count)
      .map((kid, index) => branch(kid, true, fishbone && index % 2 === 0 ? -1 : 1));
    const sizes = parts.map((part) => bounds(part.boxes));
    if (snake && groupStart > 0) {
      x = reverse ? Math.max(...tree.boxes.map((b) => b.x + b.width)) : center.width + gap;
      y = rowBottom + gap;
    }
    parts.forEach((sub, i) => {
      const b = sizes[i]!,
        child = sub.boxes[0]!;
      const leftward = fishbone || reverse;
      shift(
        sub,
        x - b.left - (leftward ? b.width : 0),
        fishbone ? (i % 2 === 0 ? -gap - child.height : center.height + gap) : y,
      );
      x += (leftward ? -1 : 1) * (b.width + gap);
      rowBottom = Math.max(rowBottom, bounds(sub.boxes).top + b.height);
      tree.boxes.push(...sub.boxes);
      tree.pairs.push([fishbone ? center : previous, child], ...sub.pairs);
      previous = child;
    });
    groupStart += count;
  }
  return tree;
}
function curve(a: Box, b: Box, vertical: boolean) {
  const ax = a.x + a.width / 2,
    ay = a.y + a.height / 2,
    bx = b.x + b.width / 2,
    by = b.y + b.height / 2;
  if (vertical) {
    const y1 = by >= ay ? a.y + a.height : a.y,
      y2 = by >= ay ? b.y : b.y + b.height;
    return `M ${ax} ${y1} V ${(y1 + y2) / 2} H ${bx} V ${y2}`;
  }
  const x1 = bx >= ax ? a.x + a.width : a.x,
    x2 = bx >= ax ? b.x : b.x + b.width;
  return `M ${x1} ${ay} C ${(x1 + x2) / 2} ${ay} ${(x1 + x2) / 2} ${by} ${x2} ${by}`;
}
export function layoutMindMap(document: MindMapDocument) {
  const { layout, root } = document;
  let tree: Tree;
  switch (layout) {
    case "mind":
      tree = doubleSided(root);
      break;
    case "tree":
    case "treeRight":
      tree = hangingTree(root, layout === "tree");
      break;
    case "org":
      tree = branch(root, true, 1);
      break;
    case "fishbone":
    case "timeline":
    case "snake":
      tree = sequence(root, layout === "fishbone", layout === "snake");
      break;
    case "right":
      tree = branch(root, false, 1);
      break;
  }
  const frame = bounds(tree.boxes);
  const links: Link[] = tree.pairs.map(([a, b]) => {
    let path: string;
    if ((layout === "tree" || layout === "treeRight") && a.topic === root) {
      const right = b.x > a.x + a.width / 2;
      path = `M ${a.x + a.width / 2} ${a.y + a.height} V ${b.y + b.height / 2} H ${right ? b.x : b.x + b.width}`;
    } else if (layout === "fishbone" && a.topic === root) {
      const y = a.y + a.height / 2,
        x = b.x + b.width / 2;
      path = `M ${a.x} ${y} H ${x + gap / 2} L ${x} ${b.y < y ? b.y + b.height : b.y}`;
    } else {
      const vertical =
        layout === "org" ||
        (["timeline", "snake", "fishbone"].includes(layout) &&
          Math.abs(a.y - b.y) > a.height * 0.75);
      path = curve(a, b, vertical);
    }
    return { from: a.topic.id, to: b.topic.id, path };
  });
  return {
    boxes: tree.boxes,
    links,
    viewBox: [frame.left - 20, frame.top - 20, frame.width + 40, frame.height + 40].join(" "),
    width: frame.width + 40,
    height: frame.height + 40,
  };
}
