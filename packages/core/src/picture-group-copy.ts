import { readPictureDataArray } from "./picture-data-array.js";
import {
  isPictureGroup,
  MAX_PICTURE_GROUP_NODES,
  traversePictureGroup,
  type PictureGroupChild,
} from "./picture-group.js";
import { normalizePictureObjectCollection, type PictureObject } from "./picture-object.js";

export type PictureClipboardCloneOptions = {
  /** Called once per required identity. Invalid/colliding output fails, without retries. */
  createId: () => string;
  /** IDs already in the destination; original node/flat-group IDs are reserved automatically. */
  reservedIds?: readonly string[];
};

/**
 * Internal-model clipboard only. All owned IDs are fresh; source asset references
 * are shared. Node IDs and standalone flat-group identities use one collision
 * namespace but separate remapping tables, even when their old strings match.
 * The factory never receives a mutable snapshot, and all IDs are checked before
 * the detached snapshot is changed or returned.
 */
export function clonePictureRootsForClipboard(
  values: readonly PictureObject[],
  options: PictureClipboardCloneOptions,
): PictureObject[] {
  const roots = normalizePictureObjectCollection(values);
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Invalid picture clipboard clone options.");
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Picture clipboard clone options must be an ordinary data record.");
  const fields: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key)!;
    if (
      typeof key !== "string" ||
      (key !== "createId" && key !== "reservedIds") ||
      !("value" in descriptor)
    )
      throw new TypeError("Picture clipboard clone options require known data fields.");
    fields[key] = descriptor.value;
  }
  if (typeof fields.createId !== "function")
    throw new TypeError("Picture clipboard cloning requires an ID factory.");
  const reserved = readPictureDataArray(
    (fields.reservedIds ?? []) as readonly string[],
    "reserved picture clipboard IDs",
    MAX_PICTURE_GROUP_NODES * 2,
  );
  if (reserved.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Reserved picture clipboard IDs must be non-empty strings.");
  const unavailable = new Set(reserved);
  const nodeIds: string[] = [];
  const flatGroupIds = new Set<string>();
  for (const root of roots) {
    for (const node of isPictureGroup(root)
      ? traversePictureGroup(root).map((visit) => visit.node)
      : [root]) {
      nodeIds.push(node.id);
      unavailable.add(node.id);
    }
    if (!isPictureGroup(root) && root.groupId !== undefined) {
      flatGroupIds.add(root.groupId);
      unavailable.add(root.groupId);
    }
  }
  const createId = fields.createId as () => string;
  function freshId(): string {
    const id = createId();
    if (typeof id !== "string" || !id.trim())
      throw new TypeError("Picture clipboard ID factory must return a non-empty string.");
    if (unavailable.has(id))
      throw new TypeError("Picture clipboard ID factory returned a collision.");
    unavailable.add(id);
    return id;
  }
  const nodes = new Map(nodeIds.map((id) => [id, freshId()]));
  const flatGroups = new Map([...flatGroupIds].map((id) => [id, freshId()]));
  function remapChild(node: PictureGroupChild): void {
    node.id = nodes.get(node.id)!;
    if (node.kind === "grouped-group-v1") for (const child of node.members) remapChild(child);
  }
  for (const root of roots) {
    // Clipboard copies may cross sheets whose producer font metrics differ.
    if ("frame" in root && root.frame.anchor.mode === "fixed")
      delete root.frame.anchor.exportEncoding;
    root.id = nodes.get(root.id)!;
    if (isPictureGroup(root)) {
      for (const child of root.members) remapChild(child);
    } else if (root.groupId !== undefined) root.groupId = flatGroups.get(root.groupId)!;
  }
  return normalizePictureObjectCollection(roots);
}
