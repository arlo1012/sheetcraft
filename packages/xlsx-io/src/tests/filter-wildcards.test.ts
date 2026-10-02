import { describe, expect, test } from "vitest";
import {
  readXlsxAutoFilter,
  writeXlsxAutoFilter,
  type XlsxFilter,
} from "../data-tools-metadata.js";

function read(pattern: string) {
  return readXlsxAutoFilter(
    `<autoFilter ref="A1:A3"><filterColumn colId="0"><customFilters><customFilter operator="equal" val="${pattern}"/></customFilters></filterColumn></autoFilter>`,
  );
}

describe("XLSX custom filter wildcards", () => {
  test("defaults a color filter to fill and explicitly marks font color", () => {
    const read = readXlsxAutoFilter(
      '<autoFilter ref="A1:A3"><filterColumn colId="0"><colorFilter dxfId="0"/></filterColumn></autoFilter>',
      ['<fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/></patternFill></fill>'],
    );
    expect(read).toMatchObject({
      unsupported: false,
      value: { columns: [{ condition: { kind: "color", target: "fill" } }] },
    });
    const filter: XlsxFilter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "color", target: "text", color: "#ff0000" },
        },
      ],
    };
    expect(writeXlsxAutoFilter(filter, { colorDxfId: () => 0 })).toContain('cellColor="0"');
  });
  test("imports a question-mark pattern and preserves literal wildcard escapes", () => {
    expect(read("A?B")).toMatchObject({
      unsupported: false,
      value: { columns: [{ condition: { kind: "text", operator: "equals", value: "A?B" } }] },
    });
    expect(read("*A~*B*")).toMatchObject({
      unsupported: false,
      value: { columns: [{ condition: { kind: "text", operator: "contains", value: "A~*B" } }] },
    });
    expect(read("A~*")).toMatchObject({
      unsupported: false,
      value: { columns: [{ condition: { kind: "text", operator: "equals", value: "A~*" } }] },
    });
    expect(read("A~~*")).toMatchObject({
      unsupported: false,
      value: { columns: [{ condition: { kind: "text", operator: "beginsWith", value: "A~~" } }] },
    });
  });

  test("exports active patterns without escaping them a second time", () => {
    const filter: XlsxFilter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "text", operator: "contains", value: "A?~*B" },
        },
      ],
    };
    const xml = writeXlsxAutoFilter(filter);
    expect(xml).toContain('val="*A?~*B*"');
    expect(readXlsxAutoFilter(xml).value).toEqual(filter);
    expect(read("").value?.columns[0]?.condition).toEqual({
      kind: "text",
      operator: "equals",
      value: "",
    });
  });
});
