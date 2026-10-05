/// <reference lib="webworker" />
import nspell from "nspell";
import type { SpellingLanguage, TextReviewRequest, TextReviewResult } from "./text-review";

const dictionaries = new Map<SpellingLanguage, Promise<ReturnType<typeof nspell>>>();
function dictionary(language: SpellingLanguage) {
  let pending = dictionaries.get(language);
  if (!pending) {
    pending = (
      language === "en-GB"
        ? Promise.all([
            import("dictionary-en-gb/index.aff?raw"),
            import("dictionary-en-gb/index.dic?raw"),
          ])
        : Promise.all([
            import("dictionary-en/index.aff?raw"),
            import("dictionary-en/index.dic?raw"),
          ])
    ).then(([aff, dic]) => nspell({ aff: aff.default, dic: dic.default }));
    dictionaries.set(language, pending);
  }
  return pending;
}
const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = async (event: MessageEvent<TextReviewRequest>) => {
  try {
    const { cells, mode, language, ignored } = event.data;
    const result: TextReviewResult = { issues: [], conversions: [], truncated: false };
    if (mode === "spelling") {
      const spell = await dictionary(language);
      const skip = new Set(ignored.map((word) => word.toLowerCase()));
      const suggestions = new Map<string, string[]>();
      outer: for (const [cell, value] of cells.entries()) {
        // English dictionaries; URLs, email addresses and mixed alphanumeric identifiers are skipped.
        const pattern =
          /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|\b[A-Za-z0-9]+(?:['’][A-Za-z]+)*\b/g;
        for (const match of value.text.matchAll(pattern)) {
          const word = match[0];
          if (
            /\d|@|:\/\//.test(word) ||
            skip.has(word.toLowerCase()) ||
            spell.correct(word.replaceAll("’", "'"))
          )
            continue;
          if (result.issues.length >= 2000) {
            result.truncated = true;
            break outer;
          }
          if (!suggestions.has(word)) suggestions.set(word, spell.suggest(word).slice(0, 8));
          result.issues.push({
            cell,
            start: match.index,
            end: match.index + word.length,
            word,
            suggestions: suggestions.get(word)!,
          });
        }
      }
    } else {
      const convert =
        mode === "to-simplified"
          ? (await import("opencc-js/t2cn")).Converter({ from: "t", to: "cn" })
          : (await import("opencc-js/cn2t")).Converter({ from: "cn", to: "t" });
      for (const [cell, value] of cells.entries()) {
        const text = convert(value.text);
        if (text !== value.text) result.conversions.push({ cell, text });
      }
    }
    worker.postMessage({ ok: true, result });
  } catch {
    worker.postMessage({ ok: false });
  }
};
