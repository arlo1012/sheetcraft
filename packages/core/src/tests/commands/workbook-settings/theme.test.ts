import { describe, expect, test } from "vitest";
import {
  createApplyCellStyleCommand,
  createSetWorkbookThemeCommand,
} from "../../../commands/index.js";
import { createBuiltinCellStyles } from "../../../cell-styles.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../../serialization.js";
import { getActiveSheet, getCellStyle } from "../../../workbook.js";
import { resolveThemeColor, resolveThemeFontFamily } from "../../../workbook-theme.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("workbook themes", () => {
  test("tints theme colors through HSL luminance without desaturating dark shades", () => {
    const theme = createTestWorkbookSession().workbook.theme;
    theme.accentColors[0] = "#ff0000";
    expect(resolveThemeColor(theme, { slot: "accent1", tint: 0.5 })).toBe("#ff8080");
    expect(resolveThemeColor(theme, { slot: "accent1", tint: -0.5 })).toBe("#800000");
    expect(resolveThemeColor(theme, { slot: "accent1", tint: 1 })).toBe("#ffffff");
    expect(resolveThemeColor(theme, { slot: "accent1", tint: -1 })).toBe("#000000");
    theme.accentColors[0] = "#4f81bd";
    expect(resolveThemeColor(theme, { slot: "accent1", tint: 0.4 })).toBe("#95b3d7");
  });

  test("updates only theme-bound styles and restores them through history and snapshots", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const target = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    const heading = createBuiltinCellStyles().find((style) => style.id === "heading-1")!;
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, target, heading));
    const next = {
      ...session.workbook.theme,
      id: "test",
      name: "Test",
      accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"] as [
        string,
        string,
        string,
        string,
        string,
        string,
      ],
    };
    expect(executeWorkbookCommand(session, createSetWorkbookThemeCommand(next))).toBe(true);
    expect(getCellStyle(sheet, target.start)?.textColor).toBe("#112233");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, target.start)?.textColor).toBe("#4f81bd");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(deserializeWorkbook(serializeWorkbook(session.workbook)).theme).toEqual(next);
  });

  test("materializes live color and font references while retaining direct overrides", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const bound = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    const direct = { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } };
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, bound, {
        textColor: resolveThemeColor(session.workbook.theme, { slot: "accent1", tint: 0.2 }),
        textColorTheme: { slot: "accent1", tint: 0.2 },
        fillColor: resolveThemeColor(session.workbook.theme, { slot: "light2" }),
        fillColorTheme: { slot: "light2" },
        fontFamily: resolveThemeFontFamily(session.workbook.theme, "major"),
        fontTheme: "major",
      }),
    );
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, direct, {
        textColor: "#123456",
        fontFamily: "Explicit Font",
      }),
    );
    const next = {
      ...session.workbook.theme,
      id: "custom",
      accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"] as [
        string,
        string,
        string,
        string,
        string,
        string,
      ],
      colors: { ...session.workbook.theme.colors!, light2: "#abc123" },
      headingFont: "Cambria",
      fonts: { ...session.workbook.theme.fonts!, headingEastAsia: "微软雅黑" },
      customColors: [
        {
          id: "mine",
          name: "Mine",
          accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"] as [
            string,
            string,
            string,
            string,
            string,
            string,
          ],
          dark1: "#000000",
          light1: "#ffffff",
          dark2: "#111111",
          light2: "#eeeeee",
          hyperlink: "#0563c1",
          followedHyperlink: "#954f72",
        },
      ],
      customFonts: [
        {
          id: "my-font",
          name: "My Font",
          headingFont: "Cambria",
          bodyFont: "Calibri",
          headingEastAsia: "微软雅黑",
          bodyEastAsia: "宋体",
        },
      ],
    };
    expect(executeWorkbookCommand(session, createSetWorkbookThemeCommand(next))).toBe(true);
    expect(getCellStyle(sheet, bound.start)).toMatchObject({
      textColor: "#274e75",
      textColorTheme: { slot: "accent1", tint: 0.2 },
      fillColor: "#abc123",
      fillColorTheme: { slot: "light2" },
      fontFamily: '"Cambria", "微软雅黑"',
      fontTheme: "major",
    });
    expect(getCellStyle(sheet, direct.start)).toMatchObject({
      textColor: "#123456",
      fontFamily: "Explicit Font",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, bound.start)?.textColor).toBe("#729aca");
    expect(deserializeWorkbook(serializeWorkbook(session.workbook)).theme).toEqual(
      session.workbook.theme,
    );
  });

  test("does not update a protected sheet containing a live theme binding", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        { textColor: "#4f81bd", textColorTheme: { slot: "accent1" } },
      ),
    );
    sheet.properties.protected = true;
    expect(() =>
      executeWorkbookCommand(
        session,
        createSetWorkbookThemeCommand({
          ...session.workbook.theme,
          accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"],
        }),
      ),
    ).toThrow("protected");
  });
});
