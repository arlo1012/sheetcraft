import {
  createAddSheetCommand,
  createSetSheetFreezePanesCommand,
  createSetSheetPropertiesCommand,
} from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readNativeWorkbook } from "../../native/reader.js";
import { NativeWorkbook } from "../../native/workbook.js";

function commandWorkbook() {
  const session = createWorkbookSession({
    workbook: createWorkbook({ id: "sheet-views", sheetId: "hidden", sheetName: "Hidden" }),
    idFactory: () => "generated",
  });
  for (const name of ["Visible", "Active"])
    executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: name, name }));
  executeWorkbookCommand(
    session,
    createSetSheetPropertiesCommand(session.workbook, "hidden", {
      hidden: true,
      tabColor: "#22a06b",
    }),
  );
  executeWorkbookCommand(
    session,
    createSetSheetPropertiesCommand(session.workbook, "Visible", { tabColor: "#0066cc" }),
  );
  executeWorkbookCommand(
    session,
    createSetSheetFreezePanesCommand("Active", { rows: 2, columns: 1 }),
  );
  return session.workbook;
}

async function patchXml(path: string, change: (xml: string) => string): Promise<Uint8Array> {
  const archive = unzipSync((await encodeXlsx(commandWorkbook())).bytes);
  archive[path] = strToU8(change(strFromU8(archive[path]!)));
  return zipSync(archive);
}

describe("native XLSX sheet-view metadata", () => {
  test("roundtrips Core-command hidden states, colors and nonfirst active identity in standard XML", async () => {
    const workbook = commandWorkbook();
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook);
    const archive = unzipSync(encoded.bytes);
    const workbookXml = strFromU8(archive["xl/workbook.xml"]!);
    expect(workbookXml).toContain('<workbookView activeTab="2"/>');
    expect(workbookXml).toContain('<sheet name="Hidden" sheetId="1" state="hidden"');
    expect(workbookXml).not.toContain('state="veryHidden"');
    expect(strFromU8(archive["xl/worksheets/sheet1.xml"]!)).toContain('<tabColor rgb="FF22A06B"/>');
    expect(strFromU8(archive["xl/worksheets/sheet2.xml"]!)).toContain('<tabColor rgb="FF0066CC"/>');
    const activeXml = strFromU8(archive["xl/worksheets/sheet3.xml"]!);
    expect(activeXml).toContain('<sheetView workbookViewId="0" tabSelected="1">');
    expect(activeXml).toContain('state="frozen"');
    expect(activeXml).not.toContain("<tabColor");
    const decoded = await decodeXlsx(encoded.bytes);
    expect([...decoded.workbook.sheets.values()].map((sheet) => sheet.properties)).toEqual([
      { hidden: true, pinned: false, protected: false, tabColor: "#22A06B" },
      { hidden: false, pinned: false, protected: false, tabColor: "#0066CC" },
      { hidden: false, pinned: false, protected: false },
    ]);
    expect(decoded.workbook.sheets.get(decoded.workbook.activeSheetId)?.name).toBe("Active");
    expect(decoded.report.issues).toEqual([]);
    expect(encoded.report.issues).toEqual([]);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(() => deserializeWorkbook(serializeWorkbook(decoded.workbook))).not.toThrow();
  });

  test("exports pinning as an explicit local-only omission without an invented XML extension", async () => {
    const workbook = commandWorkbook();
    workbook.sheets.get("hidden")!.properties.pinned = true;
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([
      { code: "feature-omitted", severity: "warning", count: 1, locations: ["Hidden.pinned"] },
    ]);
    const archive = unzipSync(encoded.bytes);
    expect(strFromU8(archive["xl/workbook.xml"]!)).not.toMatch(/pinned|sheetcraft:.*pin/i);
    expect(
      [...(await decodeXlsx(encoded.bytes)).workbook.sheets.values()][0]!.properties.pinned,
    ).toBe(false);
  });

  test("diagnoses veryHidden degradation while retaining invisibility in Core", async () => {
    const bytes = await patchXml("xl/workbook.xml", (xml) =>
      xml.replace('state="hidden"', 'state="veryHidden"'),
    );
    expect(readNativeWorkbook(bytes).sheets[0]?.state).toBe("veryHidden");
    const decoded = await decodeXlsx(bytes);
    expect([...decoded.workbook.sheets.values()][0]?.properties.hidden).toBe(true);
    expect(decoded.report.issues).toEqual([
      { code: "feature-omitted", severity: "warning", count: 1, locations: ["Hidden.veryHidden"] },
    ]);
    const reexported = unzipSync((await encodeXlsx(decoded.workbook)).bytes);
    expect(strFromU8(reexported["xl/workbook.xml"]!)).toContain('state="hidden"');
    expect(strFromU8(reexported["xl/workbook.xml"]!)).not.toContain("veryHidden");
  });

  test.each(["0", "99", "-1", "1.5", "invalid", ""])(
    "diagnoses unavailable activeTab %s and selects the first visible sheet",
    async (activeTab) => {
      const bytes = await patchXml("xl/workbook.xml", (xml) =>
        xml.replace('activeTab="2"', `activeTab="${activeTab}"`),
      );
      const decoded = await decodeXlsx(bytes);
      expect(decoded.workbook.sheets.get(decoded.workbook.activeSheetId)?.name).toBe("Visible");
      expect(decoded.report.issues).toEqual([
        {
          code: "feature-omitted",
          severity: "warning",
          count: 1,
          locations: ["workbook.activeTab"],
        },
      ]);
      expect(() => deserializeWorkbook(serializeWorkbook(decoded.workbook))).not.toThrow();
    },
  );

  test("missing activeTab uses the first visible sheet without diagnosing a missing optional attribute", async () => {
    const bytes = await patchXml("xl/workbook.xml", (xml) => xml.replace(' activeTab="2"', ""));
    const decoded = await decodeXlsx(bytes);
    expect(decoded.workbook.sheets.get(decoded.workbook.activeSheetId)?.name).toBe("Visible");
    expect(decoded.report.issues).toEqual([]);
  });

  test("a Core show command restores a sheet as visible without changing active identity", async () => {
    const workbook = commandWorkbook();
    const session = createWorkbookSession({ workbook, idFactory: () => "generated" });
    executeWorkbookCommand(
      session,
      createSetSheetPropertiesCommand(workbook, "hidden", { hidden: false }),
    );
    const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    expect([...decoded.workbook.sheets.values()][0]?.properties.hidden).toBe(false);
    expect(decoded.workbook.sheets.get(decoded.workbook.activeSheetId)?.name).toBe("Active");
  });

  test("explicit visible worksheet state imports as visible", async () => {
    const bytes = await patchXml("xl/workbook.xml", (xml) =>
      xml.replace('state="hidden"', 'state="visible"'),
    );
    const decoded = await decodeXlsx(bytes);
    expect([...decoded.workbook.sheets.values()][0]?.properties.hidden).toBe(false);
    expect(decoded.report.issues).toEqual([]);
  });

  test("rejects an import with no worksheets", async () => {
    const bytes = await patchXml("xl/workbook.xml", (xml) =>
      xml.replace(/<sheets>.*?<\/sheets>/, "<sheets/>"),
    );
    await expect(decodeXlsx(bytes)).rejects.toThrow(/no worksheets/);
  });

  test.each(["concealed", "Hidden", ""])("rejects invalid worksheet state %s", async (state) => {
    const bytes = await patchXml("xl/workbook.xml", (xml) =>
      xml.replace('state="hidden"', `state="${state}"`),
    );
    await expect(decodeXlsx(bytes)).rejects.toThrow(/worksheet state/);
  });

  test("rejects an all-hidden import", async () => {
    const bytes = await patchXml("xl/workbook.xml", (xml) =>
      xml
        .replace('<sheet name="Visible"', '<sheet state="hidden" name="Visible"')
        .replace('<sheet name="Active"', '<sheet state="veryHidden" name="Active"'),
    );
    await expect(decodeXlsx(bytes)).rejects.toThrow(/visible worksheet/);
  });

  test.each([
    "missing-active",
    "hidden-active",
    "all-hidden",
    "no-sheets",
    "invalid-hidden",
    "invalid-color",
  ])("rejects invalid Core workbook %s without changing it", async (kind) => {
    const workbook = commandWorkbook();
    if (kind === "missing-active") workbook.activeSheetId = "missing";
    if (kind === "hidden-active") workbook.activeSheetId = "hidden";
    if (kind === "all-hidden")
      for (const sheet of workbook.sheets.values()) sheet.properties.hidden = true;
    if (kind === "no-sheets") workbook.sheets.clear();
    if (kind === "invalid-hidden")
      Object.assign(workbook.sheets.get("hidden")!.properties, { hidden: "hidden" });
    if (kind === "invalid-color") workbook.sheets.get("hidden")!.properties.tabColor = "blue";
    const before = structuredClone(workbook);
    await expect(encodeXlsx(workbook)).rejects.toThrow(RangeError);
    expect(workbook).toEqual(before);
  });

  test.each([
    ['rgb="22a06b"', "#22A06B"],
    ['indexed="4"', "#0000FF"],
    ['theme="0"', "#FFFFFF"],
    ['theme="0" tint="-0.5"', "#808080"],
  ])("imports resolved tab color %s", async (attributes, expected) => {
    const bytes = await patchXml("xl/worksheets/sheet1.xml", (xml) =>
      xml.replace('<tabColor rgb="FF22A06B"/>', `<tabColor ${attributes}/>`),
    );
    const decoded = await decodeXlsx(bytes);
    expect([...decoded.workbook.sheets.values()][0]?.properties.tabColor).toBe(expected);
    expect(decoded.report.issues).toEqual([]);
  });

  test("resolves tab colors against the workbook's custom indexed palette", async () => {
    const archive = unzipSync((await encodeXlsx(commandWorkbook())).bytes);
    archive["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(archive["xl/worksheets/sheet1.xml"]!).replace(
        '<tabColor rgb="FF22A06B"/>',
        '<tabColor indexed="0"/>',
      ),
    );
    archive["xl/styles.xml"] = strToU8(
      strFromU8(archive["xl/styles.xml"]!).replace(
        "</styleSheet>",
        '<colors><indexedColors><rgbColor rgb="FF123ABC"/></indexedColors></colors></styleSheet>',
      ),
    );
    const decoded = await decodeXlsx(zipSync(archive));
    expect([...decoded.workbook.sheets.values()][0]?.properties.tabColor).toBe("#123ABC");
    expect(decoded.report.issues).toEqual([]);
  });

  test.each(['theme="99"', 'auto="1"', 'rgb="invalid"', 'rgb="8022A06B"'])(
    "diagnoses a tab color that Core cannot represent: %s",
    async (attributes) => {
      const bytes = await patchXml("xl/worksheets/sheet1.xml", (xml) =>
        xml.replace('<tabColor rgb="FF22A06B"/>', `<tabColor ${attributes}/>`),
      );
      const decoded = await decodeXlsx(bytes);
      expect([...decoded.workbook.sheets.values()][0]?.properties.tabColor).toBeUndefined();
      expect(decoded.report.issues).toEqual([
        { code: "feature-omitted", severity: "warning", count: 1, locations: ["Hidden.tabColor"] },
      ]);
    },
  );

  test("native adapter writes and reads workbook views and all standard sheet states", async () => {
    const workbook = new NativeWorkbook();
    workbook.addWorksheet("Hidden").state = "hidden";
    workbook.addWorksheet("Very hidden").state = "veryHidden";
    workbook.addWorksheet("Visible").state = "visible";
    workbook.views = [{ activeTab: 2 }];
    const restored = new NativeWorkbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(restored.worksheets.map((sheet) => sheet.state)).toEqual([
      "hidden",
      "veryHidden",
      "visible",
    ]);
    expect(restored.views).toEqual([{ activeTab: 2 }]);
    workbook.views = [{ activeTab: 0 }];
    await expect(workbook.xlsx.writeBuffer()).rejects.toThrow(/active tab.*visible/);
    workbook.views = undefined;
    expect(readNativeWorkbook(await workbook.xlsx.writeBuffer()).views).toEqual([{ activeTab: 2 }]);
    workbook.worksheets[2]!.state = "hidden";
    await expect(workbook.xlsx.writeBuffer()).rejects.toThrow(/visible worksheet/);
  });
});
