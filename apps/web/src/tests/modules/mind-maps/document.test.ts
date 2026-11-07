// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import {
  MIND_MAP_MIME,
  createMindMap,
  decodeMindMapAttachment,
  encodeMindMapAttachment,
  mindMapLayouts,
  parseMindMapDocument,
  topicLocations,
  type MindMapDocument,
  type MindMapTopic,
} from "../../../modules/mind-maps/mind-map-document";

function topic(id: string, children: MindMapTopic[] = []): MindMapTopic {
  return { id, text: `主题 ${id} 🌱`, collapsed: false, children };
}

function document(): MindMapDocument {
  return {
    format: "sheetcraft-mindmap",
    version: 1,
    title: "独立规划 🧭",
    layout: "mind",
    theme: "green",
    root: topic("root", [topic("a", [topic("a1")]), topic("b")]),
  };
}

function attachment(text: string): SheetAttachment {
  const bytes = new TextEncoder().encode(text);
  return {
    filename: "source.mindmap.json",
    mimeType: MIND_MAP_MIME,
    size: bytes.length,
    data: btoa(String.fromCharCode(...bytes)),
    display: "document",
  };
}

describe("mind map source document", () => {
  test("validates an independent tree without modifying or retaining its mutable source branches", () => {
    const source = document();
    const before = structuredClone(source);
    const parsed = parseMindMapDocument(source);
    expect(parsed).toEqual(before);
    expect(parsed.root).not.toBe(source.root);
    expect(parsed.root.children).not.toBe(source.root.children);
    parsed.root.children[0]!.text = "Edited parsed topic";
    expect(source).toEqual(before);
  });

  test("preserves collapsed descendants in source data and indexes their original order and parent", () => {
    const source = document();
    source.root.children[0]!.collapsed = true;
    const parsed = parseMindMapDocument(source);
    const locations = topicLocations(parsed.root);
    expect([...locations.keys()]).toEqual(["root", "a", "a1", "b"]);
    expect(locations.get("root")).toEqual({ topic: parsed.root, parent: undefined, depth: 0 });
    expect(locations.get("a")?.parent).toBe(parsed.root);
    expect(locations.get("a1")).toEqual({
      topic: parsed.root.children[0]!.children[0],
      parent: parsed.root.children[0],
      depth: 2,
    });
    expect(parsed.root.children[0]!.collapsed).toBe(true);
  });

  test("provides exactly the eight supported layout identities", () => {
    expect(mindMapLayouts).toEqual([
      "mind",
      "right",
      "tree",
      "treeRight",
      "org",
      "fishbone",
      "timeline",
      "snake",
    ]);
  });

  test.each(mindMapLayouts)(
    "accepts layout %s and creates an independent single-root map",
    (layout) => {
      const created = createMindMap(layout, "New map", "中心 🧠");
      expect(created).toEqual({
        format: "sheetcraft-mindmap",
        version: 1,
        title: "New map",
        layout,
        theme: "green",
        root: { id: "root", text: "中心 🧠", collapsed: false, children: [] },
      });
      expect(parseMindMapDocument({ ...document(), layout }).layout).toBe(layout);
      created.root.children.push(topic("local"));
      expect(createMindMap(layout, "New map", "中心 🧠").root.children).toEqual([]);
    },
  );

  test.each(["green", "blue", "plum"])("accepts theme %s", (theme) => {
    expect(parseMindMapDocument({ ...document(), theme }).theme).toBe(theme);
  });

  test.each([undefined, null, false, [], "{}", 1])("rejects non-document source %j", (value) => {
    expect(() => parseMindMapDocument(value)).toThrow();
  });

  test.each([
    { format: "other" },
    { version: 0 },
    { version: 2 },
    { version: "1" },
    { title: "" },
    { title: " \t\n " },
    { title: "x".repeat(129) },
    { layout: "unsupported" },
    { theme: "unsupported" },
    { root: null },
  ])("rejects unsupported or malformed document fields %j", (patch) => {
    expect(() => parseMindMapDocument({ ...document(), ...patch })).toThrow();
  });

  test("trims the document title while keeping topic text unchanged", () => {
    const source = document();
    source.title = "  Planning  ";
    source.root.text = "  Topic text\n ";
    const parsed = parseMindMapDocument(source);
    expect(parsed.title).toBe("Planning");
    expect(parsed.root.text).toBe("  Topic text\n ");
    expect(source.title).toBe("  Planning  ");
  });

  test.each([
    { id: "" },
    { id: " " },
    { id: 3 },
    { id: "x".repeat(129) },
    { text: null },
    { text: "x".repeat(4097) },
    { children: null },
    { children: {} },
    { children: [null] },
    { collapsed: undefined },
    { collapsed: "false" },
  ])("rejects malformed topic fields %j", (patch) => {
    expect(() =>
      parseMindMapDocument({ ...document(), root: { ...topic("root"), ...patch } }),
    ).toThrow();
  });

  test("rejects repeated identities across separate branches and cyclic topic references", () => {
    const repeated = document();
    repeated.root.children[1]!.id = "a1";
    expect(() => parseMindMapDocument(repeated)).toThrow();
    const cyclic = document();
    cyclic.root.children.push(cyclic.root);
    expect(() => parseMindMapDocument(cyclic)).toThrow();
  });

  test("accepts 256 topics and rejects a 257th topic", () => {
    const source = document();
    source.root.children = Array.from({ length: 255 }, (_, i) => topic(`child-${i}`));
    expect(topicLocations(parseMindMapDocument(source).root).size).toBe(256);
    source.root.children.push(topic("overflow"));
    expect(() => parseMindMapDocument(source)).toThrow();
  });

  test("accepts depth 32 and rejects a descendant at depth 33 even inside a collapsed branch", () => {
    const source = document();
    source.root.children = [];
    let last = source.root;
    for (let depth = 1; depth <= 32; depth++) {
      const child = topic(`depth-${depth}`);
      last.children.push(child);
      last = child;
    }
    expect(topicLocations(parseMindMapDocument(source).root).get("depth-32")?.depth).toBe(32);
    source.root.collapsed = true;
    last.children.push(topic("depth-33"));
    expect(() => parseMindMapDocument(source)).toThrow();
  });
});

describe("mind map source attachment", () => {
  test("round trips UTF-8 topic trees and presentation settings without changing either input", () => {
    const source = document();
    source.layout = "snake";
    source.theme = "plum";
    source.root.children[0]!.collapsed = true;
    const before = structuredClone(source);
    const encoded = encodeMindMapAttachment(source);
    const encodedBefore = structuredClone(encoded);
    expect(MIND_MAP_MIME).toBe("application/vnd.sheetcraft.mindmap+json");
    expect(encoded).toMatchObject({ mimeType: MIND_MAP_MIME, display: "document" });
    expect(encoded.filename).toMatch(/\.mindmap\.json$/);
    const bytes = Uint8Array.from(atob(encoded.data), (char) => char.charCodeAt(0));
    expect(encoded.size).toBe(bytes.length);
    expect(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).toEqual(before);
    expect(decodeMindMapAttachment(encoded)).toEqual(before);
    expect(source).toEqual(before);
    expect(encoded).toEqual(encodedBefore);
  });

  test.each([
    { mimeType: "application/json" },
    { mimeType: "text/plain" },
    { data: "%%%=" },
    { size: -1 },
    { size: 1 },
  ])("safely ignores a mismatched or damaged attachment %j", (patch) => {
    const source = { ...attachment(JSON.stringify(document())), ...patch };
    const before = structuredClone(source);
    expect(decodeMindMapAttachment(source)).toBeUndefined();
    expect(source).toEqual(before);
  });

  test.each(["", "{", "null", "[]", JSON.stringify({ ...document(), version: 2 })])(
    "safely ignores invalid source JSON %j",
    (text) => {
      expect(decodeMindMapAttachment(attachment(text))).toBeUndefined();
    },
  );

  test("safely ignores invalid UTF-8 and a valid JSON tree with duplicate identities", () => {
    expect(decodeMindMapAttachment({ ...attachment("x"), data: "/w==" })).toBeUndefined();
    const source = document();
    source.root.children[1]!.id = source.root.id;
    expect(decodeMindMapAttachment(attachment(JSON.stringify(source)))).toBeUndefined();
  });
});
