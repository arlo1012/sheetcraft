export type WordRule = { word: string; replacement: string };
export type DictionaryCategory = "accepted" | "mistakes" | "sensitive" | "terms" | "people";
export type WordDictionary = {
  version: 2;
  accepted: string[];
  mistakes: WordRule[];
  sensitive: WordRule[];
  terms: WordRule[];
  people: WordRule[];
  builtins: boolean;
};
export type WordIssue = {
  id: string;
  cell: number;
  start: number;
  end: number;
  word: string;
  replacement: string;
  kind: Exclude<DictionaryCategory, "accepted">;
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
  return {
    version: 2,
    accepted: [],
    mistakes: [],
    sensitive: [],
    terms: [],
    people: [],
    builtins: true,
  };
}
export function parseDictionary(value: unknown): WordDictionary {
  if (!value || typeof value !== "object") throw new Error("invalid-dictionary");
  const source = value as Record<string, unknown>;
  if (source.version !== 1 && source.version !== 2) throw new Error("invalid-dictionary");
  const v = (source.version === 1
    ? { ...source, sensitive: [], terms: [], people: [] }
    : source) as unknown as WordDictionary;
  if (
    typeof v.builtins !== "boolean" ||
    !Array.isArray(v.accepted) ||
    !Array.isArray(v.mistakes) ||
    !Array.isArray(v.sensitive) ||
    !Array.isArray(v.terms) ||
    !Array.isArray(v.people) ||
    v.accepted.length + v.mistakes.length + v.sensitive.length + v.terms.length + v.people.length >
      5000
  )
    throw new Error("invalid-dictionary");
  const valid = (s: unknown): s is string =>
    typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 100;
  const validRules = (rules: WordRule[], optional = false, allowSame = false) =>
    rules.every(
      (r) =>
        r &&
        valid(r.word) &&
        (valid(r.replacement) || (optional && r.replacement === "")) &&
        (allowSame || r.word !== r.replacement),
    ) && new Set(rules.map((r) => r.word)).size === rules.length;
  if (
    !v.accepted.every(valid) ||
    !validRules(v.mistakes) ||
    !validRules(v.sensitive, true) ||
    !validRules(v.terms) ||
    !validRules(v.people, false, true) ||
    v.mistakes.some((r) => v.accepted.includes(r.word))
  )
    throw new Error("invalid-dictionary");
  const copy = (rules: WordRule[]) =>
    rules.map((r) => ({ word: r.word, replacement: r.replacement }));
  return {
    version: 2,
    builtins: v.builtins,
    accepted: [...new Set(v.accepted)],
    mistakes: copy(v.mistakes),
    sensitive: copy(v.sensitive),
    terms: copy(v.terms),
    people: copy(v.people),
  };
}

// A title is checked only when it is registered and directly adjacent to a known name.
// Unknown titles, other sentences, and separate cells are not inferred.
function personCandidates(text: string, people: readonly WordRule[], cell: number): WordIssue[] {
  const titles = [...new Set(people.map((p) => p.replacement))].sort((a, b) => b.length - a.length);
  const candidates: WordIssue[] = [];
  const names: [number, number][] = [];
  for (const person of [...people].sort((a, b) => b.word.length - a.word.length)) {
    let index = text.indexOf(person.word);
    while (index >= 0) {
      const nameEnd = index + person.word.length;
      if (!names.some(([start, end]) => start <= index && nameEnd <= end)) {
        names.push([index, nameEnd]);
        const before = text.slice(0, index);
        const after = text.slice(nameEnd);
        const leftGap = before.match(/[ \t:：]*$/)?.[0] ?? "";
        const rightGap = after.match(/^[ \t:：]*/)?.[0] ?? "";
        const left = before.slice(0, before.length - leftGap.length);
        const right = after.slice(rightGap.length);
        const leftTitle = titles.find((title) => left.endsWith(title));
        const leftBoundary = leftTitle ? left.slice(0, -leftTitle.length).at(-1) : undefined;
        const rightTitle = titles.find((title) => right.startsWith(title));
        const rightBoundary = rightTitle ? right[rightTitle.length] : undefined;
        if (
          leftTitle &&
          leftTitle !== person.replacement &&
          (!leftBoundary || !/[\p{L}\p{N}_]/u.test(leftBoundary))
        ) {
          const start = index - leftGap.length - leftTitle.length;
          candidates.push({
            id: `${cell}:${start}:${nameEnd}`,
            cell,
            start,
            end: nameEnd,
            word: text.slice(start, nameEnd),
            replacement: person.replacement + leftGap + person.word,
            kind: "people",
          });
        }
        if (
          rightTitle &&
          rightTitle !== person.replacement &&
          (!rightBoundary || !/[\p{L}\p{N}_]/u.test(rightBoundary))
        ) {
          const end = nameEnd + rightGap.length + rightTitle.length;
          candidates.push({
            id: `${cell}:${index}:${end}`,
            cell,
            start: index,
            end,
            word: text.slice(index, end),
            replacement: person.word + rightGap + person.replacement,
            kind: "people",
          });
        }
      }
      index = text.indexOf(person.word, index + 1);
    }
  }
  return candidates;
}
export function scanWords(
  cells: readonly { text: string }[],
  dictionary: WordDictionary,
  limit = 2000,
) {
  const rules = new Map<string, WordRule & { kind: WordIssue["kind"] }>(
    (dictionary.builtins ? builtinRules : []).map((r) => [r.word, { ...r, kind: "mistakes" }]),
  );
  for (const rule of dictionary.terms) rules.set(rule.word, { ...rule, kind: "terms" });
  for (const rule of dictionary.mistakes) rules.set(rule.word, { ...rule, kind: "mistakes" });
  for (const rule of dictionary.sensitive) rules.set(rule.word, { ...rule, kind: "sensitive" });
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
    const candidates: WordIssue[] = personCandidates(text, dictionary.people, cell).filter(
      (issue) => !accepted.some(([a, b]) => a <= issue.start && b >= issue.end),
    );
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
