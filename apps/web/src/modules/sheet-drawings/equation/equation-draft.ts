import {
  cloneEquationDocument,
  findEquationNode,
  normalizeEquationDocument,
  walkEquationDocument,
  type EquationDocument,
  type EquationFractionStyle,
  type EquationMatrix,
  type EquationNode,
  type EquationSequence,
} from "@sheetcraft/core/equation-document";

/** UTF-16 offsets within a semantic sequence; each nested structure occupies one unit. */
export type EquationSelection = { slotId: string; start: number; end: number };
export type EquationDraftSnapshot = { document: EquationDocument; selection: EquationSelection };
export type EquationDraftAction =
  | { type: "replace-text"; selection: EquationSelection; text: string; mode?: "math" | "normal" }
  | { type: "insert-nodes"; selection: EquationSelection; nodes: EquationNode[] }
  | { type: "fraction-style"; nodeId: string; style: EquationFractionStyle }
  | {
      type: "matrix-row" | "matrix-column";
      nodeId: string;
      operation: "insert" | "delete";
      index: number;
    }
  | { type: "matrix-alignment"; nodeId: string; alignment: EquationMatrix["alignment"] };

export function equationNodeLength(node: EquationNode): number {
  return node.kind === "text" || node.kind === "latex" ? node.value.length : 1;
}
export function equationSlotText(slot: EquationSequence): string {
  return slot.children
    .map((node) => (node.kind === "text" || node.kind === "latex" ? node.value : "\ufffc"))
    .join("");
}
function boundaries(text: string): number[] {
  // Intl.Segmenter preserves combining marks, emoji modifiers, and ZWJ clusters.
  const result = [0];
  for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text))
    result.push(segment.index + segment.segment.length);
  return result;
}
export function normalizeEquationSelection(
  document: EquationDocument,
  selection?: EquationSelection,
): EquationSelection {
  const candidate = selection ? findEquationNode(document, selection.slotId) : undefined;
  const slot = candidate?.kind === "sequence" ? candidate : document.body;
  const text = equationSlotText(slot),
    stops = [0];
  let offset = 0;
  for (const child of slot.children) {
    const length = equationNodeLength(child);
    if (child.kind === "text" || child.kind === "latex") {
      for (const stop of boundaries(child.value).slice(1)) stops.push(offset + stop);
    } else stops.push(offset + length);
    offset += length;
  }
  const finite = (n: number) =>
    Number.isFinite(n) ? Math.min(text.length, Math.max(0, Math.trunc(n))) : 0;
  const a = finite(selection?.start ?? text.length),
    b = finite(selection?.end ?? a);
  const low = Math.min(a, b),
    high = Math.max(a, b);
  let start = 0;
  for (const stop of stops) {
    if (stop > low) break;
    start = stop;
  }
  const end = low === high ? start : (stops.find((n) => n >= high) ?? text.length);
  return { slotId: slot.id, start, end };
}
export function createEquationDraft(
  document: EquationDocument,
  selection?: EquationSelection,
): EquationDraftSnapshot {
  const detached = cloneEquationDocument(document);
  return { document: detached, selection: normalizeEquationSelection(detached, selection) };
}
export function cloneEquationDraft(snapshot: EquationDraftSnapshot): EquationDraftSnapshot {
  return createEquationDraft(snapshot.document, snapshot.selection);
}
export function equationDocumentKey(document: EquationDocument): string {
  return JSON.stringify(normalizeEquationDocument(document));
}
export function equationDraftsEqual(a: EquationDraftSnapshot, b: EquationDraftSnapshot): boolean {
  return (
    a.selection.slotId === b.selection.slotId &&
    a.selection.start === b.selection.start &&
    a.selection.end === b.selection.end &&
    equationDocumentKey(a.document) === equationDocumentKey(b.document)
  );
}
function idFactory(document: EquationDocument): () => string {
  const used = new Set<string>();
  walkEquationDocument(document, (node) => used.add(node.id));
  let next = 0;
  return () => {
    let id: string;
    do {
      id = `equation-draft-${++next}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
}
function freshNodes(nodes: EquationNode[], nextId: () => string): EquationNode[] {
  const detached = normalizeEquationDocument({
    kind: "equation-document-v1",
    body: {
      kind: "sequence",
      id: nextId(),
      children: nodes,
    },
  });
  walkEquationDocument(detached, (node) => {
    node.id = nextId();
  });
  return detached.body.children;
}
function spliceSlot(
  slot: EquationSequence,
  start: number,
  end: number,
  inserted: EquationNode[],
  nextId: () => string,
): void {
  const before: EquationNode[] = [],
    after: EquationNode[] = [];
  let offset = 0;
  for (const child of slot.children) {
    const length = equationNodeLength(child),
      stop = offset + length;
    if (stop <= start) before.push(child);
    else if (offset >= end) after.push(child);
    else if (child.kind === "text" || child.kind === "latex") {
      const left = child.value.slice(0, Math.max(0, start - offset));
      const right = child.value.slice(Math.max(0, end - offset));
      if (left) before.push({ ...child, value: left });
      if (right) after.push({ ...child, id: left ? nextId() : child.id, value: right });
    }
    offset = stop;
  }
  const children = [...before, ...inserted, ...after];
  // Adjacent compatible text leaves do not make typing create unbounded nodes.
  slot.children = [];
  for (const child of children) {
    const previous = slot.children.at(-1);
    if (
      previous?.kind === "text" &&
      child.kind === "text" &&
      (previous.mode ?? "math") === (child.mode ?? "math")
    )
      previous.value += child.value;
    else if (previous?.kind === "latex" && child.kind === "latex") previous.value += child.value;
    else slot.children.push(child);
  }
}
function emptySlot(nextId: () => string): EquationSequence {
  return { kind: "sequence", id: nextId(), children: [] };
}
/** Invalid/stale targets and all budget failures leave the original snapshot untouched. */
export function applyEquationDraftAction(
  snapshot: EquationDraftSnapshot,
  action: EquationDraftAction,
): EquationDraftSnapshot | null {
  try {
    const document = cloneEquationDocument(snapshot.document),
      nextId = idFactory(document);
    let selection = normalizeEquationSelection(document, snapshot.selection);
    if (action.type === "replace-text" || action.type === "insert-nodes") {
      const slot = findEquationNode(document, action.selection.slotId);
      if (slot?.kind !== "sequence") return null;
      selection = normalizeEquationSelection(document, action.selection);
      if (
        action.type === "replace-text" &&
        equationSlotText(slot).slice(selection.start, selection.end) === action.text &&
        !action.text.includes("\ufffc") &&
        (action.mode === undefined ||
          slot.children.every(
            (node) => node.kind === "text" && (node.mode ?? "math") === action.mode,
          ))
      ) {
        const stop = selection.start + action.text.length;
        return { document, selection: { slotId: slot.id, start: stop, end: stop } };
      }
      let inserted: EquationNode[];
      if (action.type === "insert-nodes") inserted = freshNodes(action.nodes, nextId);
      else {
        let offset = 0;
        let inheritedMode: "math" | "normal" | undefined;
        const latex =
          action.mode === undefined &&
          slot.children.some((node) => {
            const start = offset;
            offset += equationNodeLength(node);
            if (node.kind === "text" && selection.start >= start && selection.end <= offset)
              inheritedMode = node.mode ?? "math";
            return node.kind === "latex" && selection.start >= start && selection.end <= offset;
          });
        inserted = action.text
          ? [
              latex
                ? { kind: "latex", id: nextId(), value: action.text }
                : {
                    kind: "text",
                    id: nextId(),
                    value: action.text,
                    ...((action.mode ?? inheritedMode)
                      ? { mode: action.mode ?? inheritedMode }
                      : {}),
                  },
            ]
          : [];
      }
      const stop =
        selection.start + inserted.reduce((length, node) => length + equationNodeLength(node), 0);
      spliceSlot(slot, selection.start, selection.end, inserted, nextId);
      selection = { slotId: slot.id, start: stop, end: stop };
    } else {
      const node = findEquationNode(document, action.nodeId);
      if (action.type === "fraction-style") {
        if (node?.kind !== "fraction") return null;
        node.style = action.style;
      } else {
        if (node?.kind !== "matrix") return null;
        if (action.type === "matrix-alignment") node.alignment = action.alignment;
        else {
          const row = action.type === "matrix-row";
          const count = row ? node.rows.length : node.rows[0]!.length;
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index > count ||
            (action.operation === "delete" && (action.index === count || count === 1))
          )
            return null;
          if (action.operation === "insert") {
            if (count >= 16) return null;
            if (row)
              node.rows.splice(
                action.index,
                0,
                node.rows[0]!.map(() => emptySlot(nextId)),
              );
            else for (const cells of node.rows) cells.splice(action.index, 0, emptySlot(nextId));
          } else if (row) node.rows.splice(action.index, 1);
          else for (const cells of node.rows) cells.splice(action.index, 1);
          // A deleted current slot moves to a surviving cell, never another equation owner.
          if (!findEquationNode(document, selection.slotId)) {
            const surviving = node.rows[Math.min(action.index, node.rows.length - 1)]![0]!;
            selection = { slotId: surviving.id, start: 0, end: 0 };
          }
        }
      }
    }
    const validated = normalizeEquationDocument(document);
    return { document: validated, selection: normalizeEquationSelection(validated, selection) };
  } catch {
    return null;
  }
}

/** Product navigation command; native WPS Tab traversal was not established. */
export function nextEquationSlot(
  snapshot: EquationDraftSnapshot,
  direction: "forward" | "backward",
): EquationSelection {
  const slots: EquationSequence[] = [];
  walkEquationDocument(snapshot.document, (node) => {
    if (node.kind === "sequence") slots.push(node);
  });
  const current = Math.max(
    0,
    slots.findIndex((slot) => slot.id === snapshot.selection.slotId),
  );
  const slot = slots[(current + (direction === "forward" ? 1 : slots.length - 1)) % slots.length]!;
  return { slotId: slot.id, start: 0, end: 0 };
}
export function equationStructureAtSelection(
  document: EquationDocument,
  selection: EquationSelection,
): EquationNode | undefined {
  let found: EquationNode | undefined;
  walkEquationDocument(document, (node, parent) => {
    if (node.id === selection.slotId && parent && parent.kind !== "sequence") found = parent;
  });
  return found;
}

/** Local history is deliberately separate from workbook command history. */
export class EquationDraftHistory {
  private states: EquationDraftSnapshot[];
  private position = 0;
  constructor(snapshot: EquationDraftSnapshot) {
    this.states = [cloneEquationDraft(snapshot)];
  }
  get current(): EquationDraftSnapshot {
    return cloneEquationDraft(this.states[this.position]!);
  }
  get canUndo(): boolean {
    return this.position > 0;
  }
  get canRedo(): boolean {
    return this.position < this.states.length - 1;
  }
  select(selection: EquationSelection): EquationDraftSnapshot {
    const state = this.states[this.position]!;
    state.selection = normalizeEquationSelection(state.document, selection);
    return this.current;
  }
  push(snapshot: EquationDraftSnapshot): EquationDraftSnapshot {
    const next = cloneEquationDraft(snapshot),
      current = this.states[this.position]!;
    if (equationDocumentKey(current.document) === equationDocumentKey(next.document)) {
      current.selection = next.selection;
      return this.current;
    }
    this.states.splice(this.position + 1);
    this.states.push(next);
    if (this.states.length > 100) this.states.shift();
    this.position = this.states.length - 1;
    return this.current;
  }
  apply(action: EquationDraftAction): EquationDraftSnapshot | null {
    const next = applyEquationDraftAction(this.states[this.position]!, action);
    return next ? this.push(next) : null;
  }
  undo(): EquationDraftSnapshot | null {
    if (!this.canUndo) return null;
    --this.position;
    return this.current;
  }
  redo(): EquationDraftSnapshot | null {
    if (!this.canRedo) return null;
    ++this.position;
    return this.current;
  }
}

export type EquationCompositionCapture = {
  ownerId: string;
  sessionId: number;
  documentKey: string;
  selection: EquationSelection;
};
export function captureEquationComposition(
  snapshot: EquationDraftSnapshot,
  ownerId: string,
  sessionId: number,
): EquationCompositionCapture {
  return {
    ownerId,
    sessionId,
    documentKey: equationDocumentKey(snapshot.document),
    selection: normalizeEquationSelection(snapshot.document, snapshot.selection),
  };
}
export function finishEquationComposition(
  snapshot: EquationDraftSnapshot,
  capture: EquationCompositionCapture,
  text: string,
  ownerId: string,
  sessionId: number,
): EquationDraftSnapshot | null {
  if (
    capture.ownerId !== ownerId ||
    capture.sessionId !== sessionId ||
    capture.documentKey !== equationDocumentKey(snapshot.document)
  )
    return null;
  return applyEquationDraftAction(snapshot, {
    type: "replace-text",
    selection: capture.selection,
    text,
  });
}

/** Common-prefix/suffix reconciliation expands both sides to complete grapheme clusters. */
export function equationTextDifference(
  oldValue: string,
  value: string,
): { start: number; end: number; text: string } {
  let start = 0;
  while (start < oldValue.length && start < value.length && oldValue[start] === value[start])
    ++start;
  let oldEnd = oldValue.length,
    newEnd = value.length;
  while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === value[newEnd - 1]) {
    --oldEnd;
    --newEnd;
  }
  const oldStops = boundaries(oldValue),
    newStops = boundaries(value);
  while (start > 0 && (!oldStops.includes(start) || !newStops.includes(start))) --start;
  while (oldEnd < oldValue.length && !oldStops.includes(oldEnd)) ++oldEnd;
  while (newEnd < value.length && !newStops.includes(newEnd)) ++newEnd;
  return { start, end: oldEnd, text: value.slice(start, newEnd) };
}
/** Neighboring semantic unit range, including hard edges around every structure. */
export function equationAdjacentSelection(
  textDocument: EquationDocument,
  selection: EquationSelection,
  direction: "forward" | "backward",
  extend = false,
): EquationSelection | undefined {
  const normalized = normalizeEquationSelection(textDocument, selection);
  if (!extend && normalized.start !== normalized.end) return normalized;
  const slot = findEquationNode(textDocument, normalized.slotId);
  if (slot?.kind !== "sequence") return;
  const stops = [0];
  let offset = 0;
  for (const child of slot.children) {
    const length = equationNodeLength(child);
    if (child.kind === "text" || child.kind === "latex")
      for (const stop of boundaries(child.value).slice(1)) stops.push(offset + stop);
    else stops.push(offset + length);
    offset += length;
  }
  const edge = direction === "forward" ? normalized.end : normalized.start;
  const neighbor =
    direction === "forward"
      ? stops.find((n) => n > edge)
      : [...stops].reverse().find((n) => n < edge);
  if (neighbor === undefined) return;
  return {
    slotId: slot.id,
    start: direction === "forward" ? (extend ? normalized.start : edge) : neighbor,
    end: direction === "forward" ? neighbor : extend ? normalized.end : edge,
  };
}
/** Move from a structure's edge to its containing sequence without flattening that structure. */
export function exitEquationSlot(
  document: EquationDocument,
  selection: EquationSelection,
  direction: "forward" | "backward",
): EquationSelection | undefined {
  const slot = findEquationNode(document, selection.slotId);
  if (
    slot?.kind !== "sequence" ||
    selection.start !== selection.end ||
    (direction === "forward"
      ? selection.end !== equationSlotText(slot).length
      : selection.start !== 0)
  )
    return undefined;
  const parents = new Map<string, EquationNode>();
  walkEquationDocument(document, (node, parent) => {
    if (parent) parents.set(node.id, parent);
  });
  let child: EquationNode = slot,
    parent = parents.get(child.id);
  while (parent) {
    if (parent.kind === "sequence") {
      let offset = 0;
      for (const node of parent.children) {
        if (node.id === child.id) {
          const position = offset + (direction === "forward" ? equationNodeLength(node) : 0);
          return { slotId: parent.id, start: position, end: position };
        }
        offset += equationNodeLength(node);
      }
    }
    child = parent;
    parent = parents.get(child.id);
  }
  return undefined;
}
