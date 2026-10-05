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
  test("migrates version 1 to version 2 with empty new categories", () => {
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
      const source = { ...emptyDictionary(), [category]: [{ word: "词条", replacement: "标准" }] };
      const parsed = parseDictionary(source);
      parsed[category][0]!.replacement = "修改";
      expect(source[category][0]?.replacement).toBe("标准");
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

  test("allows an empty sensitive suggestion but requires terminology and person titles", () => {
    expect(
      parseDictionary({ ...emptyDictionary(), sensitive: [{ word: "禁词", replacement: "" }] })
        .sensitive,
    ).toEqual([{ word: "禁词", replacement: "" }]);
    for (const category of ["terms", "people"] as const) {
      expect(() =>
        parseDictionary({ ...emptyDictionary(), [category]: [{ word: "词条", replacement: "" }] }),
      ).toThrow();
    }
    expect(() =>
      parseDictionary({ ...emptyDictionary(), terms: [{ word: "同词", replacement: "同词" }] }),
    ).toThrow();
    expect(
      parseDictionary({ ...emptyDictionary(), people: [{ word: "同词", replacement: "同词" }] })
        .people,
    ).toHaveLength(1);
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
  test("reports sensitive and terminology rules with their kinds and optional sensitive deletion", () => {
    const dictionary = parseDictionary({
      ...emptyDictionary(),
      sensitive: [{ word: "禁词", replacement: "" }],
      terms: [{ word: "旧术语", replacement: "标准术语" }],
    });
    const cells = [{ text: "禁词与旧术语" }],
      result = scanWords(cells, dictionary);
    expect(result.issues.map((issue) => [issue.word, issue.replacement, issue.kind])).toEqual([
      ["禁词", "", "sensitive"],
      ["旧术语", "标准术语", "terms"],
    ]);
    expect(wordChanges(cells, result.issues)).toEqual([{ cell: 0, text: "与标准术语" }]);
  });

  test("uses sensitive, custom mistake, terminology and builtin priority for identical words", () => {
    const base = emptyDictionary(),
      word = "再接再励";
    const terms = [{ word, replacement: "术语" }],
      mistakes = [{ word, replacement: "自定义" }],
      sensitive = [{ word, replacement: "敏感替代" }];
    for (const [dictionary, replacement, kind] of [
      [{ ...base, terms, mistakes, sensitive }, "敏感替代", "sensitive"],
      [{ ...base, terms, mistakes }, "自定义", "mistakes"],
      [{ ...base, terms }, "术语", "terms"],
      [base, "再接再厉", "mistakes"],
    ] as const) {
      expect(scanWords([{ text: word }], dictionary).issues).toMatchObject([
        { word, replacement, kind },
      ]);
    }
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

  test("accepted phrases suppress all categories and overlapping outputs remain disjoint", () => {
    const dictionary = {
      ...emptyDictionary(),
      accepted: ["禁词旧术语经理张三"],
      sensitive: [{ word: "禁词", replacement: "" }],
      terms: [{ word: "旧术语", replacement: "新术语" }],
      people: [
        { word: "张三", replacement: "主任" },
        { word: "李四", replacement: "经理" },
      ],
    };
    expect(scanWords([{ text: "禁词旧术语经理张三" }], dictionary).issues).toEqual([]);
    const result = scanWords([{ text: "经理张三" }], {
      ...dictionary,
      accepted: [],
      sensitive: [{ word: "张三", replacement: "某人" }],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ word: "经理张三", kind: "people" });
  });
});
