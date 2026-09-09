import { describe, expect, test } from "vitest";
import {
  formatCellNumberValue,
  toCellNumberFormatCode,
  validateCellNumberFormatCode,
} from "../../number-format.js";
import { normalizeCellNumberFormat } from "../../style.js";

const WPS_RMB_UPPERCASE = "[DBNum2][$RMB]G/通用格式;[Red][DBNum2][$RMB]G/通用格式";

describe("special number formats", () => {
  test("preserves and renders WPS RMB uppercase codes through yuan, jiao and fen", () => {
    expect(validateCellNumberFormatCode(WPS_RMB_UPPERCASE)).toBe(true);
    expect(normalizeCellNumberFormat({ kind: "special", code: WPS_RMB_UPPERCASE })).toEqual({
      kind: "special",
      code: "[DBNum2][$RMB]General;[Red][DBNum2][$RMB]General",
    });
    expect(toCellNumberFormatCode({ kind: "special", code: WPS_RMB_UPPERCASE })).toBe(
      "[DBNum2][$RMB]General;[Red][DBNum2][$RMB]General",
    );
    expect(formatCellNumberValue(12, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "壹拾贰元整",
    );
    expect(formatCellNumberValue(12.3, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "壹拾贰元叁角",
    );
    expect(formatCellNumberValue(12.03, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "壹拾贰元零叁分",
    );
    expect(formatCellNumberValue(0.03, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "叁分",
    );
    expect(formatCellNumberValue(0, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "零元整",
    );
    expect(formatCellNumberValue(-12.03, { kind: "special", code: WPS_RMB_UPPERCASE })).toEqual({
      text: "负壹拾贰元零叁分",
      color: "red",
    });
    expect(
      formatCellNumberValue(-12, {
        kind: "special",
        code: '[DBNum2][$RMB]General;"[Red]"[DBNum2][$RMB]General',
      }),
    ).toEqual({ text: "[Red]负壹拾贰元整" });
    expect(
      formatCellNumberValue(12, { kind: "custom", code: '"[DBNum2][$RMB]General"' }).text,
    ).toBe("[DBNum2][$RMB]General");
  });

  test("renders the portable postal-code, signed-number and ten-thousand-yuan codes", () => {
    expect(formatCellNumberValue(1234, { kind: "special", code: "000000" }).text).toBe("001234");
    expect(formatCellNumberValue(12, { kind: "special", code: "+0;-0;0" }).text).toBe("+12");
    expect(formatCellNumberValue(-12, { kind: "special", code: "+0;-0;0" }).text).toBe("-12");
    expect(formatCellNumberValue(0, { kind: "special", code: "+0;-0;0" }).text).toBe("0");
    expect(formatCellNumberValue(123_456, { kind: "special", code: '0"."0,"万元"' }).text).toBe(
      "12.3万元",
    );
  });

  test("uses compact Chinese upper numerals only for the typed DBNum2 special preset", () => {
    const compact = {
      kind: "special" as const,
      code: "[DBNum2][$-804]General",
      chineseUpperStyle: "compact" as const,
    };
    expect(normalizeCellNumberFormat(compact)).toEqual(compact);
    expect(toCellNumberFormatCode(compact)).toBe("[DBNum2][$-804]General");
    expect(formatCellNumberValue(10, compact).text).toBe("拾");
    expect(formatCellNumberValue(12.25, compact).text).toBe("拾贰点贰伍");
    expect(formatCellNumberValue(100_000, compact).text).toBe("拾万");
    expect(formatCellNumberValue(-10, compact).text).toBe("-拾");
    expect(formatCellNumberValue("壹拾贰", compact).text).toBe("壹拾贰");
    expect(
      formatCellNumberValue(10, { kind: "special", code: "[DBNum2][$-804]General" }).text,
    ).toBe("壹拾");
    expect(() =>
      normalizeCellNumberFormat({
        kind: "special",
        code: "000000",
        chineseUpperStyle: "compact",
      }),
    ).toThrow(TypeError);
  });

  test("applies RMB only when its section is selected and validates the whole code", () => {
    expect(
      formatCellNumberValue(-12, { kind: "custom", code: '"a-b"[DBNum2][$RMB]General' }).text,
    ).toBe("a-b负壹拾贰元整");
    expect(
      formatCellNumberValue(-12, { kind: "custom", code: '"-"[DBNum2][$RMB]General' }).text,
    ).toBe("-负壹拾贰元整");
    expect(
      formatCellNumberValue(-12, { kind: "custom", code: "[<-10][DBNum2][$RMB]General;0" }).text,
    ).toBe("负壹拾贰元整");
    const conditional = '[>0]0.00;[<0][Red][DBNum2][$RMB]General;"zero"';
    expect(formatCellNumberValue(12, { kind: "special", code: conditional }).text).toBe("12.00");
    expect(formatCellNumberValue(-12, { kind: "special", code: conditional })).toEqual({
      text: "负壹拾贰元整",
      color: "red",
    });
    expect(formatCellNumberValue(0, { kind: "special", code: conditional }).text).toBe("zero");
    expect(formatCellNumberValue(1.005, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "壹元零壹分",
    );
    expect(formatCellNumberValue(1000.565, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "壹仟元伍角柒分",
    );
    expect(formatCellNumberValue(-1e-8, { kind: "special", code: WPS_RMB_UPPERCASE }).text).toBe(
      "零元整",
    );
    expect(validateCellNumberFormatCode("[DBNum2][$RMB]General[broken")).toBe(false);
    expect(validateCellNumberFormatCode(`${WPS_RMB_UPPERCASE};0;@;0`)).toBe(false);
    expect(
      formatCellNumberValue(-12, {
        kind: "special",
        code: '[DBNum2][$RMB]General;"-"[DBNum2][$RMB]General',
      }).text,
    ).toBe("-负壹拾贰元整");
    expect(
      formatCellNumberValue(-12, {
        kind: "special",
        code: "[DBNum2][$RMB]General;\\-[DBNum2][$RMB]General",
      }).text,
    ).toBe("-负壹拾贰元整");
    expect(
      formatCellNumberValue(-12, {
        kind: "special",
        code: "[DBNum2][$RMB]General;[DBNum2][$RMB]General",
      }).text,
    ).toBe("负壹拾贰元整");
  });
});
