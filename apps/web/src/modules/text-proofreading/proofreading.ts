export type WordRule = { word: string; replacement: string };
export type WordDictionary = {
  version: 1;
  accepted: string[];
  mistakes: WordRule[];
  builtins: boolean;
};
export type WordIssue = {
  id: string;
  cell: number;
  start: number;
  end: number;
  word: string;
  replacement: string;
};
// Explicit phrase rules, never an inference that an unknown Chinese word is incorrect.
export const builtinRules: readonly WordRule[] = [
  { word: "再接再励", replacement: "再接再厉" },
  { word: "按步就班", replacement: "按部就班" },
  { word: "一愁莫展", replacement: "一筹莫展" },
  { word: "迫不急待", replacement: "迫不及待" },
  { word: "穿流不息", replacement: "川流不息" },
  { word: "相形见拙", replacement: "相形见绌" },
  { word: "谈笑风声", replacement: "谈笑风生" },
  { word: "名列前矛", replacement: "名列前茅" },
  { word: "默守成规", replacement: "墨守成规" },
  { word: "走头无路", replacement: "走投无路" },
];
export function emptyDictionary(): WordDictionary {
  return { version: 1, accepted: [], mistakes: [], builtins: true };
}
export function parseDictionary(value: unknown): WordDictionary {
  if (!value || typeof value !== "object") throw new Error("invalid-dictionary");
  const v = value as WordDictionary;
  if (
    v.version !== 1 ||
    typeof v.builtins !== "boolean" ||
    !Array.isArray(v.accepted) ||
    !Array.isArray(v.mistakes) ||
    v.accepted.length + v.mistakes.length > 5000
  )
    throw new Error("invalid-dictionary");
  const valid = (s: unknown): s is string =>
    typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 100;
  if (
    !v.accepted.every(valid) ||
    !v.mistakes.every((r) => r && valid(r.word) && valid(r.replacement) && r.word !== r.replacement)
  )
    throw new Error("invalid-dictionary");
  if (
    new Set(v.mistakes.map((r) => r.word)).size !== v.mistakes.length ||
    v.mistakes.some((r) => v.accepted.includes(r.word))
  )
    throw new Error("invalid-dictionary");
  return {
    version: 1,
    builtins: v.builtins,
    accepted: [...new Set(v.accepted)],
    mistakes: v.mistakes.map((r) => ({ word: r.word, replacement: r.replacement })),
  };
}
export function scanWords(
  cells: readonly { text: string }[],
  dictionary: WordDictionary,
  limit = 2000,
) {
  const rules = new Map((dictionary.builtins ? builtinRules : []).map((r) => [r.word, r]));
  for (const rule of dictionary.mistakes) rules.set(rule.word, rule);
  const ordered = [...rules.values()].sort((a, b) => b.word.length - a.word.length);
  const issues: WordIssue[] = [];
  for (const [cell, { text }] of cells.entries()) {
    const accepted: [number, number][] = [];
    for (const word of dictionary.accepted) {
      let start = text.indexOf(word);
      while (start >= 0) {
        accepted.push([start, start + word.length]);
        start = text.indexOf(word, start + 1);
      }
    }
    const candidates: WordIssue[] = [];
    for (const rule of ordered) {
      let start = text.indexOf(rule.word);
      while (start >= 0) {
        const end = start + rule.word.length;
        if (!accepted.some(([a, b]) => a <= start && b >= end))
          candidates.push({ id: `${cell}:${start}:${end}`, cell, start, end, ...rule });
        start = text.indexOf(rule.word, start + 1);
      }
    }
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    let end = -1;
    for (const issue of candidates) {
      if (issue.start < end) continue;
      if (issues.length === limit) return { issues, truncated: true };
      issues.push(issue);
      end = issue.end;
    }
  }
  return { issues, truncated: false };
}
export function wordChanges(cells: readonly { text: string }[], issues: readonly WordIssue[]) {
  const groups = new Map<number, WordIssue[]>();
  for (const issue of issues) groups.set(issue.cell, [...(groups.get(issue.cell) ?? []), issue]);
  return [...groups].map(([cell, entries]) => {
    let text = cells[cell]!.text;
    for (const issue of entries.sort((a, b) => b.start - a.start))
      text = text.slice(0, issue.start) + issue.replacement + text.slice(issue.end);
    return { cell, text };
  });
}
