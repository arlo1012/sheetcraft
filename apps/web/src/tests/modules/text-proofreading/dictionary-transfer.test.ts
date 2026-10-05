import { describe, expect, test } from "vitest";
import {
  dictionaryEntries,
  parseDictionaryText,
  serializeDictionaryText,
} from "../../../modules/text-proofreading/dictionary-transfer";
import {
  emptyDictionary,
  type DictionaryCategory,
} from "../../../modules/text-proofreading/proofreading";

const categories: DictionaryCategory[] = ["accepted", "mistakes", "sensitive", "terms", "people"];
describe("dictionary TSV transfer", () => {
  test.each(categories)("roundtrips %s entries without adding a header", (category) => {
    const rows = [
      { word: "词条一", replacement: category === "accepted" ? "" : "替换一" },
      { word: "词条二", replacement: category === "accepted" ? "" : "替换二" },
    ];
    const text = serializeDictionaryText(rows, category);
    expect(text.startsWith("词条一")).toBe(true);
    expect(parseDictionaryText(text, category)).toEqual(rows);
    expect(parseDictionaryText("\uFEFF" + text, category)).toEqual(rows);
  });

  test("preserves quoted tabs, newlines and doubled quotes in two-column entries", () => {
    const rows = [
      { word: "旧\t术语", replacement: '新"术语\n续行' },
      { word: "普通", replacement: "标准" },
    ];
    const text = serializeDictionaryText(rows, "terms");
    expect(text).toBe('"旧\t术语"\t"新""术语\n续行"\r\n普通\t标准');
    expect(parseDictionaryText(text, "terms")).toEqual(rows);
  });

  test("treats the first row as data rather than an inferred header", () => {
    expect(parseDictionaryText("姓名\t职务\n张三\t主任", "people")).toEqual([
      { word: "姓名", replacement: "职务" },
      { word: "张三", replacement: "主任" },
    ]);
  });

  test("imports sensitive words from a single column with empty suggestions", () => {
    expect(parseDictionaryText("禁词一\n禁词二", "sensitive")).toEqual([
      { word: "禁词一", replacement: "" },
      { word: "禁词二", replacement: "" },
    ]);
  });

  test("trims fields and ignores blank rows", () => {
    expect(parseDictionaryText(" 旧词 \t 新词 \n\n另词\t另解\n", "mistakes")).toEqual([
      { word: "旧词", replacement: "新词" },
      { word: "另词", replacement: "另解" },
    ]);
  });

  test.each(categories)("rejects extra columns and empty %s files", (category) => {
    const excess = category === "accepted" ? "词\t多列" : "词\t替换\t多列";
    expect(() => parseDictionaryText(excess, category)).toThrow("invalid-import");
    for (const empty of ["", "\uFEFF", " \n\t\n "]) {
      expect(() => parseDictionaryText(empty, category)).toThrow("invalid-import");
    }
  });

  test("rejects more than 5000 rows and accepts exactly 5000", () => {
    const rows = Array.from({ length: 5000 }, (_, index) => `词${index}`);
    expect(parseDictionaryText(rows.join("\n"), "accepted")).toHaveLength(5000);
    expect(() => parseDictionaryText([...rows, "多余"].join("\n"), "accepted")).toThrow(
      "invalid-import",
    );
  });

  test.each(categories)("returns independently owned %s dictionary entries", (category) => {
    const dictionary = emptyDictionary();
    dictionary.accepted = ["正词"];
    for (const field of ["mistakes", "sensitive", "terms", "people"] as const)
      dictionary[field] = [{ word: "原词", replacement: "原替换" }];
    const entries = dictionaryEntries(dictionary, category);
    expect(entries).toEqual(
      category === "accepted"
        ? [{ word: "正词", replacement: "" }]
        : [{ word: "原词", replacement: "原替换" }],
    );
    entries[0]!.word = "改词";
    entries[0]!.replacement = "改替换";
    entries.push({ word: "新增", replacement: "" });
    expect(dictionary.accepted).toEqual(["正词"]);
    for (const field of ["mistakes", "sensitive", "terms", "people"] as const)
      expect(dictionary[field]).toEqual([{ word: "原词", replacement: "原替换" }]);
  });
});
