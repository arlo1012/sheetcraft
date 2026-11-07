import { createMindMap, parseMindMapDocument, type MindMapTopic } from "./mind-map-document";

export function importHeadingOutline(markdown: string) {
  const levels: MindMapTopic[] = [];
  let root: MindMapTopic | undefined;
  let count = 0;
  for (const line of markdown.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!heading) {
      const current = levels.at(-1);
      if (!current && line.trim()) throw new TypeError("Expected a root heading.");
      if (current && line.trim()) current.note = current.note ? current.note + "\n" + line : line;
      continue;
    }
    const level = heading[1]!.length;
    if (level > levels.length + 1 || (level === 1 && root))
      throw new TypeError("Invalid heading level.");
    const topic: MindMapTopic = {
      id: "topic-" + ++count,
      text: heading[2]!,
      children: [],
      collapsed: false,
    };
    if (level === 1) root = topic;
    else levels[level - 2]!.children.push(topic);
    levels.length = level - 1;
    levels.push(topic);
  }
  if (!root) throw new TypeError("Missing central topic.");
  return parseMindMapDocument({
    ...createMindMap("mind", root.text.slice(0, 128), root.text),
    root,
  });
}
