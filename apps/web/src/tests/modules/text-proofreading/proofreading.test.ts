import { describe, expect, test } from "vitest";
import {
  emptyDictionary,
  parseDictionary,
  scanWords,
  wordChanges,
} from "../../../modules/text-proofreading/proofreading";

describe("Chinese phrase proofreading", () => {
  test("reports explicit builtin mistakes without flagging unknown or correct phrases", () => {
    const result = scanWords(
      [{ text: "再接再励，按步就班。再接再厉，陌生术语。" }],
      emptyDictionary(),
    );
    expect(result.truncated).toBe(false);
    expect(result.issues.map(({ word, replacement }) => ({ word, replacement }))).toEqual([
      { word: "再接再励", replacement: "再接再厉" },
      { word: "按步就班", replacement: "按部就班" },
    ]);
    expect(
      scanWords([{ text: "再接再励" }], { ...emptyDictionary(), builtins: false }).issues,
    ).toEqual([]);
  });

  test("custom rules override builtins and add new recognized mistakes", () => {
    const dictionary = parseDictionary({
      ...emptyDictionary(),
      mistakes: [
        { word: "再接再励", replacement: "继续努力" },
        { word: "项木", replacement: "项目" },
      ],
    });
    expect(
      wordChanges(
        [{ text: "项木：再接再励" }],
        scanWords([{ text: "项木：再接再励" }], dictionary).issues,
      ),
    ).toEqual([{ cell: 0, text: "项目：继续努力" }]);
  });

  test("accepted phrases suppress contained occurrences but preserve mistakes outside them", () => {
    const cells = [{ text: "品牌再接再励；再接再励；品牌再接再励" }];
    const dictionary = { ...emptyDictionary(), accepted: ["品牌再接再励"] };
    const result = scanWords(cells, dictionary);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ start: 7, end: 11, word: "再接再励" });
    expect(wordChanges(cells, result.issues)).toEqual([
      { cell: 0, text: "品牌再接再励；再接再厉；品牌再接再励" },
    ]);
  });

  test("partial overlap with an accepted phrase does not suppress the entire mistake", () => {
    const result = scanWords([{ text: "再接再励" }], { ...emptyDictionary(), accepted: ["再接"] });
    expect(result.issues).toHaveLength(1);
  });

  test("chooses the longest match at the same position and avoids overlapping replacements", () => {
    const dictionary = parseDictionary({
      ...emptyDictionary(),
      builtins: false,
      mistakes: [
        { word: "甲乙", replacement: "短" },
        { word: "甲乙丙", replacement: "长" },
        { word: "乙丙丁", replacement: "交叉" },
      ],
    });
    const cells = [{ text: "甲乙丙丁甲乙" }];
    const result = scanWords(cells, dictionary);
    expect(result.issues.map((issue) => [issue.start, issue.end, issue.word])).toEqual([
      [0, 3, "甲乙丙"],
      [4, 6, "甲乙"],
    ]);
    expect(wordChanges(cells, result.issues)).toEqual([{ cell: 0, text: "长丁短" }]);
  });

  test("groups multiple replacements per cell and uses original offsets for unequal lengths", () => {
    const dictionary = parseDictionary({
      ...emptyDictionary(),
      builtins: false,
      mistakes: [
        { word: "错甲", replacement: "正确甲" },
        { word: "错乙", replacement: "乙" },
      ],
    });
    const cells = [{ text: "错甲与错乙和错甲" }, { text: "正确" }, { text: "错乙错甲" }];
    const issues = scanWords(cells, dictionary).issues;
    expect(issues).toHaveLength(5);
    expect(wordChanges(cells, [...issues].reverse()).sort((a, b) => a.cell - b.cell)).toEqual([
      { cell: 0, text: "正确甲与乙和正确甲" },
      { cell: 2, text: "乙正确甲" },
    ]);
    expect(cells[0]?.text).toBe("错甲与错乙和错甲");
  });

  test("marks truncation only when additional issues exist beyond the limit", () => {
    const cells = [{ text: "再接再励" }, { text: "按步就班" }];
    expect(scanWords(cells, emptyDictionary(), 1)).toMatchObject({
      truncated: true,
      issues: [{ cell: 0 }],
    });
    expect(scanWords(cells, emptyDictionary(), 2).truncated).toBe(false);
    expect(scanWords(cells, emptyDictionary(), 0)).toEqual({ issues: [], truncated: true });
    expect(scanWords([{ text: "正确文本" }], emptyDictionary(), 0)).toEqual({
      issues: [],
      truncated: false,
    });
  });
});

describe("word dictionary deserialization", () => {
  test("deduplicates accepted words and returns independently owned data", () => {
    const source = {
      version: 1,
      builtins: false,
      accepted: ["专名", "专名"],
      mistakes: [{ word: "错词", replacement: "正词" }],
    };
    const parsed = parseDictionary(source);
    expect(parsed.accepted).toEqual(["专名"]);
    parsed.accepted.push("新增");
    parsed.mistakes[0]!.replacement = "其他";
    expect(source.accepted).toEqual(["专名", "专名"]);
    expect(source.mistakes[0]?.replacement).toBe("正词");
  });

  test.each([
    null,
    { ...emptyDictionary(), version: 2 },
    { ...emptyDictionary(), builtins: "yes" },
    { ...emptyDictionary(), accepted: "专名" },
    { ...emptyDictionary(), mistakes: null },
    { ...emptyDictionary(), accepted: [""] },
    { ...emptyDictionary(), accepted: [" 前后空格 "] },
    { ...emptyDictionary(), accepted: ["长".repeat(101)] },
    { ...emptyDictionary(), mistakes: [{ word: "错词", replacement: "" }] },
    { ...emptyDictionary(), mistakes: [{ word: "相同", replacement: "相同" }] },
    {
      ...emptyDictionary(),
      mistakes: [
        { word: "重复", replacement: "一" },
        { word: "重复", replacement: "二" },
      ],
    },
    { ...emptyDictionary(), accepted: ["冲突"], mistakes: [{ word: "冲突", replacement: "替换" }] },
    { ...emptyDictionary(), accepted: Array.from({ length: 5001 }, (_, index) => `词${index}`) },
  ])("rejects malformed or conflicting persisted dictionaries (%#)", (value) => {
    expect(() => parseDictionary(value)).toThrow("invalid-dictionary");
  });
});
