import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readExternalFixture } from "../external-fixtures.js";

const range = { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } };
const whole = {
  id: "whole",
  range,
  type: "whole" as const,
  operator: "between" as const,
  formula1: "1",
  formula2: "10",
  allowBlank: true,
  errorStyle: "stop" as const,
};

async function importAlerts(attributes: string) {
  const entries = unzipSync(await readExternalFixture("data-tools-base"));
  const path = "xl/worksheets/sheet1.xml";
  entries[path] = strToU8(
    strFromU8(entries[path]!).replace(
      "</worksheet>",
      `<dataValidations count="1"><dataValidation type="whole" sqref="A2" ${attributes}><formula1>1</formula1><formula2>10</formula2></dataValidation></dataValidations></worksheet>`,
    ),
  );
  return getActiveSheet((await decodeXlsx(zipSync(entries))).workbook).dataValidations![0]!;
}

describe("XLSX validation alert flags", () => {
  test.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
  ] as const)("imports both alert flags encoded as %s", async (value, expected) => {
    const rule = await importAlerts(`showInputMessage="${value}" showErrorMessage="${value}"`);
    expect(rule.showInput).toBe(expected);
    expect(rule.showError).toBe(expected);
  });

  test("maps omitted OOXML alerts to false without enabling Core's default error alert", async () => {
    const rule = await importAlerts("");
    expect(rule.showInput).toBeUndefined();
    expect(rule.showError).toBe(false);
  });

  test.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])("roundtrips explicit showInput=%s and showError=%s", async (showInput, showError) => {
    const workbook = createWorkbook({ id: "alerts", sheetId: "sheet" });
    getActiveSheet(workbook).dataValidations = [{ ...whole, showInput, showError }];
    const exported = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(exported.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain(`showInputMessage="${showInput ? "1" : "0"}"`);
    expect(xml).toContain(`showErrorMessage="${showError ? "1" : "0"}"`);
    const rule = getActiveSheet((await decodeXlsx(exported.bytes)).workbook).dataValidations![0]!;
    expect(rule).toMatchObject({ showInput, showError, errorStyle: "stop" });
  });

  test("exports Core's omitted error-alert default as true while leaving its input default false", async () => {
    const workbook = createWorkbook({ id: "default-alerts", sheetId: "sheet" });
    getActiveSheet(workbook).dataValidations = [whole];
    const exported = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(exported.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain('showErrorMessage="1"');
    expect(xml).not.toContain("showInputMessage=");
    const rule = getActiveSheet((await decodeXlsx(exported.bytes)).workbook).dataValidations![0]!;
    expect(rule.showError).toBe(true);
    expect(rule.showInput).toBeUndefined();
  });
});
