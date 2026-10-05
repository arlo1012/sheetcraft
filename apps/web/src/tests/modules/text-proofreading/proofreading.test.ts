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
  test("migrates version 1 to version 3 with empty new categories", () => {
    expect(
      parseDictionary({
        version: 1,
        builtins: true,
        accepted: ["专名"],
        mistakes: [{ word: "错误", replacement: "正确" }],
      }),
    ).toEqual({
      ...emptyDictionary(),
      accepted: ["专名"],
      mistakes: [{ word: "错误", replacement: "正确" }],
    });
  });

  test.each(["sensitive", "terms", "people"] as const)(
    "validates and independently copies %s rules",
    (category) => {
      const replacement = category === "people" ? "标准" : "";
      const source = { ...emptyDictionary(), [category]: [{ word: "词条", replacement }] };
      const parsed = parseDictionary(source);
      parsed[category][0]!.replacement = "修改";
      expect(source[category][0]?.replacement).toBe(replacement);
      for (const invalid of [
        null,
        "text",
        [{ word: "", replacement: "标准" }],
        [{ word: "词条", replacement: 42 }],
        [{ word: "词条", replacement: " 标准" }],
        [
          { word: "词条", replacement: "标准" },
          { word: "词条", replacement: "另一" },
        ],
      ]) {
        expect(() => parseDictionary({ ...emptyDictionary(), [category]: invalid })).toThrow(
          "invalid-dictionary",
        );
      }
    },
  );

  test("requires single-word categories to have empty replacements and people to have titles", () => {
    for (const category of ["sensitive", "terms"] as const) {
      expect(
        parseDictionary({ ...emptyDictionary(), [category]: [{ word: "词条", replacement: "" }] })[
          category
        ],
      ).toEqual([{ word: "词条", replacement: "" }]);
      expect(() =>
        parseDictionary({
          ...emptyDictionary(),
          [category]: [{ word: "词条", replacement: "替换" }],
        }),
      ).toThrow("invalid-dictionary");
      expect(() =>
        parseDictionary({
          ...emptyDictionary(),
          [category]: [
            { word: "词条", replacement: "" },
            { word: "词条", replacement: "" },
          ],
        }),
      ).toThrow("invalid-dictionary");
    }
    expect(() =>
      parseDictionary({ ...emptyDictionary(), people: [{ word: "人名", replacement: "" }] }),
    ).toThrow();
  });

  test("migrates version 2 sensitive words and deduplicates canonical terms", () => {
    const source = {
      ...emptyDictionary(),
      version: 2,
      sensitive: [{ word: "禁词", replacement: "旧替换" }],
      terms: [
        { word: "旧一", replacement: "标准词" },
        { word: "旧二", replacement: "标准词" },
      ],
    };
    const migrated = parseDictionary(source);
    expect(migrated.version).toBe(3);
    expect(migrated.sensitive).toEqual([{ word: "禁词", replacement: "" }]);
    expect(migrated.terms).toEqual([{ word: "标准词", replacement: "" }]);
    expect(source.sensitive[0]?.replacement).toBe("旧替换");
  });

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
    { ...emptyDictionary(), version: 999 },
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

describe("five-category proofreading rules", () => {
  test("terms protect standard phrases while sensitive words remain forbidden", () => {
    const dictionary = parseDictionary({
      ...emptyDictionary(),
      terms: [{ word: "再接再励", replacement: "" }],
      sensitive: [{ word: "禁词", replacement: "" }],
    });
    const cells = [{ text: "禁词与再接再励" }];
    const result = scanWords(cells, dictionary);
    expect(result.issues.map((issue) => [issue.word, issue.replacement, issue.kind])).toEqual([
      ["禁词", "", "sensitive"],
    ]);
    expect(wordChanges(cells, result.issues)).toEqual([{ cell: 0, text: "与再接再励" }]);
  });

  test("positive dictionaries never allow sensitive words even inside a longer ordinary mistake", () => {
    const dictionary = {
      ...emptyDictionary(),
      accepted: ["长禁词句"],
      terms: [{ word: "长禁词句", replacement: "" }],
      sensitive: [{ word: "禁词", replacement: "" }],
      mistakes: [{ word: "长禁词句", replacement: "普通建议" }],
    };
    expect(scanWords([{ text: "长禁词句" }], dictionary).issues).toMatchObject([
      { word: "禁词", replacement: "", kind: "sensitive", start: 1, end: 3 },
    ]);
    expect(
      scanWords([{ text: "长禁词句" }], { ...dictionary, accepted: [], terms: [] }).issues,
    ).toMatchObject([{ word: "禁词", kind: "sensitive" }]);
  });

  test("terms suppress custom mistakes and custom mistakes otherwise override builtins", () => {
    const word = "再接再励",
      dictionary = { ...emptyDictionary(), mistakes: [{ word, replacement: "自定义" }] };
    expect(scanWords([{ text: word }], dictionary).issues).toMatchObject([
      { replacement: "自定义", kind: "mistakes" },
    ]);
    expect(
      scanWords([{ text: word }], { ...dictionary, terms: [{ word, replacement: "" }] }).issues,
    ).toEqual([]);
  });

  test("corrects registered mismatched titles before and after names, retaining separators", () => {
    const dictionary = {
      ...emptyDictionary(),
      people: [
        { word: "张三", replacement: "主任" },
        { word: "李四", replacement: "经理" },
      ],
    };
    const cells = [{ text: "经理：张三；张三\t经理；主任 李四；李四:主任" }];
    const result = scanWords(cells, dictionary);
    expect(result.issues.map((issue) => issue.kind)).toEqual([
      "people",
      "people",
      "people",
      "people",
    ]);
    expect(wordChanges(cells, result.issues)).toEqual([
      { cell: 0, text: "主任：张三；张三\t主任；经理 李四；李四:经理" },
    ]);
  });

  test("does not infer unknown titles, cross-sentence, newline or separate-cell pairs", () => {
    const dictionary = {
      ...emptyDictionary(),
      people: [
        { word: "张三", replacement: "主任" },
        { word: "李四", replacement: "经理" },
      ],
    };
    const texts = [
      "张三董事",
      "副经理张三",
      "张三经理助理",
      "经理。张三",
      "张三，经理",
      "张三\n经理",
      "张三",
      "经理",
      "张三主任",
      "主任张三",
    ];
    expect(
      scanWords(
        texts.map((text) => ({ text })),
        dictionary,
      ).issues,
    ).toEqual([]);
  });

  test("chooses the longest registered title and longest containing name", () => {
    const dictionary = {
      ...emptyDictionary(),
      people: [
        { word: "张", replacement: "部长" },
        { word: "张三", replacement: "主任" },
        { word: "李四", replacement: "经理" },
        { word: "王五", replacement: "总经理" },
      ],
    };
    const cells = [{ text: "总经理张三；张三总经理" }];
    const result = scanWords(cells, dictionary);
    expect(result.issues.map((issue) => issue.word)).toEqual(["总经理张三", "张三总经理"]);
    expect(wordChanges(cells, result.issues)).toEqual([{ cell: 0, text: "主任张三；张三主任" }]);
  });

  test("accepted phrases suppress ordinary checks but not sensitive checks", () => {
    const dictionary = {
      ...emptyDictionary(),
      accepted: ["禁词旧术语经理张三"],
      sensitive: [{ word: "禁词", replacement: "" }],
      terms: [{ word: "旧术语", replacement: "" }],
      people: [
        { word: "张三", replacement: "主任" },
        { word: "李四", replacement: "经理" },
      ],
    };
    expect(scanWords([{ text: "禁词旧术语经理张三" }], dictionary).issues).toMatchObject([
      { word: "禁词", kind: "sensitive" },
    ]);
    const result = scanWords([{ text: "经理张三" }], {
      ...dictionary,
      accepted: [],
      sensitive: [{ word: "张三", replacement: "" }],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ word: "张三", kind: "sensitive" });
  });
});
