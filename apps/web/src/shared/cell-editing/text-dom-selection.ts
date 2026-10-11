export type TextDomSelection = {
  start: number;
  end: number;
  direction: "none" | "forward" | "backward";
};

export function textDomOffset(root: HTMLElement, node: Node, point: number): number | undefined {
  if (!root.contains(node)) return undefined;
  try {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, point);
    return range.toString().length;
  } catch {
    return undefined;
  }
}

export function readTextInputTargetRange(
  root: HTMLElement,
  event: InputEvent,
): TextDomSelection | undefined {
  const ranges = event.getTargetRanges?.();
  if (!ranges || ranges.length !== 1) return undefined;
  const range = ranges[0]!;
  const start = textDomOffset(root, range.startContainer, range.startOffset);
  const end = textDomOffset(root, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined || start > end) return undefined;
  return { start, end, direction: "none" };
}

/** Read logical UTF-16 text offsets from the controlled, text-node-only editing surface. */
export function readTextDomSelection(root: HTMLElement): TextDomSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  )
    return undefined;
  const anchor = textDomOffset(root, selection.anchorNode, selection.anchorOffset);
  const focus = textDomOffset(root, selection.focusNode, selection.focusOffset);
  if (anchor === undefined || focus === undefined) return undefined;
  return {
    start: Math.min(anchor, focus),
    end: Math.max(anchor, focus),
    direction: anchor === focus ? "none" : anchor < focus ? "forward" : "backward",
  };
}

export function writeTextDomSelection(root: HTMLElement, value: TextDomSelection): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection) return;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  function point(offset: number): { node: Node; offset: number } {
    let remainder = Math.max(0, offset);
    for (const node of nodes) {
      if (remainder <= node.length) return { node, offset: remainder };
      remainder -= node.length;
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.length } : { node: root, offset: 0 };
  }
  const start = point(value.start);
  const end = point(value.end);
  if (typeof selection.setBaseAndExtent === "function") {
    const [anchor, focus] = value.direction === "backward" ? [end, start] : [start, end];
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  } else {
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
