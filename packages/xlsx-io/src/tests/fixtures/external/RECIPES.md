# Archived fixture recipes

These are the original test fixture recipes, archived for provenance only. They are not imported or run by the tests and do not require a spreadsheet authoring dependency to be installed. They were evaluated with ExcelJS 4.4.0 before replacing the runtime adapter. The snippets use the original `ExcelJS`, `fflate/browser`, and Node `readFile` bindings. `import.meta.url` in the pivot recipe refers to its original test file.

## fills-gradients.xlsx

Original test: `styles/fills.test.ts`.

```ts
async function authoredBytes(configure: (sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

return authoredBytes((sheet) => {
  sheet.getCell("A1").value = "angle";
  sheet.getCell("A1").fill = {
    type: "gradient",
    gradient: "angle",
    degree: 0,
    stops: [
      { position: 0, color: { argb: "FF112233" } },
      { position: 0.5, color: { argb: "FF445566" } },
      { position: 1, color: { argb: "FF778899" } },
    ],
  };
  sheet.getCell("B1").value = "path";
  sheet.getCell("B1").fill = {
    type: "gradient",
    gradient: "path",
    center: { left: 0.2, right: 0.7, top: 0.3, bottom: 0.8 },
    stops: [
      { position: 0, color: { argb: "FF102030" } },
      { position: 1, color: { argb: "FFa0b0c0" } },
    ],
  };
});
```

## fills-malformed-gradient.xlsx

Original test: `styles/fills.test.ts`.

```ts
async function authoredBytes(configure: (sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

return authoredBytes((sheet) => {
  sheet.getCell("A1").value = "invalid";
  sheet.getCell("A1").fill = {
    type: "gradient",
    gradient: "angle",
    degree: 20,
    stops: [
      { position: 0.25, color: { argb: "FF112233" } },
      { position: 1, color: { argb: "FF445566" } },
    ],
  };
});
```

## fills-unrepresentable-colors.xlsx

Original test: `styles/fills.test.ts`.

```ts
async function authoredBytes(configure: (sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

return authoredBytes((sheet) => {
  sheet.getCell("A1").value = "theme";
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "darkGrid",
    fgColor: { theme: 4 },
    bgColor: { argb: "FF112233" },
  };
  sheet.getCell("B1").value = "indexed";
  sheet.getCell("B1").fill = {
    type: "pattern",
    pattern: "lightGrid",
    fgColor: { argb: "FF445566" },
    bgColor: { indexed: 64 },
  };
});
```

## codec-sparse-styles.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getRow(9).height = 30;
  sheet.getCell("C5").font = { bold: true };
});
```

## codec-shared-formulas.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = 1;
  sheet.getCell("A1").font = { bold: true };
  sheet.getCell("A1").border = { top: { style: "thin" } };
  sheet.getCell("B1").numFmt = "yyyy-mm-dd";
  sheet.fillFormula("C1:C3", "A1*2", [2, 2, 2], "shared");
});
```

## codec-invalid-font.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = "large";
  sheet.getCell("A1").font = { name: "x".repeat(81), size: 200 };
});
```

## codec-explicit-no-fill.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = "plain";
  sheet.getCell("A1").fill = { type: "pattern", pattern: "none" };
});
```

## codec-malformed-number-format.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = 1;
  sheet.getCell("A1").numFmt = "not-a-format";
});
```

## codec-active-tab.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((workbook) => {
  workbook.addWorksheet("Second");
  workbook.views = [{ activeTab: 1 }];
});
```

## codec-invisible-diagonal.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = "plain";
  sheet.getCell("A1").border = {
    diagonal: { style: "thin", color: { argb: "FF112233" }, up: false, down: false },
  };
});
```

## codec-unsupported-borders.xlsx

Original test: `codec-loss.test.ts`.

```ts
async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

return bytesFor((_workbook, sheet) => {
  sheet.getCell("A1").value = "unsupported";
  sheet.getCell("A1").border = {
    top: { style: "thin", color: { theme: 1 } },
    diagonal: { style: "thick", color: { theme: 1 }, up: true },
  };
});
```

## data-tools-base.xlsx

Original test: `data-tools-metadata.test.ts`.

```ts
async function workbookWith(xml: string): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  sheet.getCell("A1").value = "Name";
  sheet.getCell("B1").value = "Score";
  sheet.getCell("A2").value = "Ada";
  sheet.getCell("B2").value = 3;
  sheet.getCell("A3").value = "Grace";
  sheet.getCell("B3").value = 8;
  const entries = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()));
  const source = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
  entries["xl/worksheets/sheet1.xml"] = strToU8(
    source.replace("</worksheet>", `${xml}</worksheet>`),
  );
  return zipSync(entries);
}

return workbookWith("");
```

## number-formats-conditional-dbnum.xlsx

Original test: `number-formats/xlsx-number-formats.test.ts`.

```ts
async function fixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Formats");
  sheet.getCell("A1").value = 1;
  sheet.getCell("A1").numFmt = "[Red][<=0]0.00;[Blue]0.00";
  sheet.getCell("B1").value = 123;
  sheet.getCell("B1").numFmt = "[DBNum2]General";
  const bytes = await workbook.xlsx.writeBuffer();

  return new Uint8Array(bytes);
}
return fixture();
```

## io-values-1904.xlsx

Original test: `xlsx-io.test.ts`.

```ts
async function fixtureBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.properties.date1904 = true;
  const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.getCell("A1").value = 41;
  sheet.getCell("B1").value = { formula: "A1+1", result: 42 };
  sheet.getCell("C1").value = "text";
  sheet.getColumn(1).width = 18;
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A3:B3");
  sheet.getCell("A3").value = "merged";
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

return fixtureBytes();
```

## io-formula-no-cache.xlsx

Original test: `xlsx-io.test.ts`.

```ts
async function simpleFormulaBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Formula");
  sheet.getCell("A1").value = 1;
  sheet.getCell("B1").value = { formula: "A1+1" };
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

return simpleFormulaBytes();
```

## io-formula-zero-false-cache.xlsx

Original test: `xlsx-io.test.ts`.

```ts
async function formulaCacheBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Caches");
  sheet.getCell("A1").value = { formula: "1-1", result: 0 };
  sheet.getCell("B1").value = { formula: "1=1", result: false };
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

return formulaCacheBytes();
```

## io-relocated-notes.xlsx

Original test: `xlsx-io.test.ts`.

```ts
async function noteFixtureBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Notes");
  sheet.getCell("B2").value = "review me";
  sheet.getCell("B2").note = { texts: [{ text: "First line\nSecond line" }] };
  sheet.getCell("D4").note = { texts: [{ text: "Blank cell note" }] };
  const bytes = await workbook.xlsx.writeBuffer();
  const entries = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const comments = strFromU8(entries["xl/comments1.xml"]!);
  const commentPart = "xl/review/comments/note-part.xml";
  entries[commentPart] = strToU8(
    comments.replace("<author>Author</author>", "<author>Ada Lovelace</author>"),
  );
  delete entries["xl/comments1.xml"];
  entries["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(
    strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!).replace(
      'Target="../comments1.xml"',
      'Target="/xl/review/comments/note-part.xml"',
    ),
  );
  return zipSync(entries);
}

return noteFixtureBytes();
```

## pivot-closedxml-clean-sources.xlsx

Original test: `pivot-tables/native-import.test.ts`.

```ts
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SOURCE_SHEETS = ["Area Source", "Area - PT", "Consolidate", "Consolidate - PT"];
async function nativeFixture(): Promise<Uint8Array> {
  const bytes = new Uint8Array(
    await readFile(new URL("./fixtures/closedxml-all-sources.xlsx", import.meta.url)),
  );
  const original = new ExcelJS.Workbook();
  await original.xlsx.load(bytes);
  const clean = new ExcelJS.Workbook();
  for (const name of SOURCE_SHEETS) {
    const destination = clean.addWorksheet(name);
    original.getWorksheet(name)!.eachRow((row) =>
      row.eachCell((cell) => {
        destination.getCell(cell.address).value = cell.value;
      }),
    );
  }
  const entries = unzipSync(new Uint8Array(await clean.xlsx.writeBuffer()));
  const independent = unzipSync(bytes);
  const bindings = [
    { sheet: 2, pivot: 3, cache: 1, records: 1, cacheId: 0 },
    { sheet: 4, pivot: 7, cache: 7, records: 6, cacheId: 6 },
  ];
  const overrides: string[] = [];
  for (const binding of bindings) {
    const pivotPath = `xl/pivotTables/pivotTable${binding.pivot}.xml`;
    const cachePath = `xl/pivotCache/pivotCacheDefinition${binding.cache}.xml`;
    const recordsPath = `xl/pivotCache/pivotCacheRecords${binding.records}.xml`;
    for (const path of [
      pivotPath,
      `xl/pivotTables/_rels/pivotTable${binding.pivot}.xml.rels`,
      cachePath,
      `xl/pivotCache/_rels/pivotCacheDefinition${binding.cache}.xml.rels`,
      recordsPath,
    ])
      entries[path] = independent[path]!;
    for (const [path, type] of [
      [pivotPath, "pivotTable"],
      [cachePath, "pivotCacheDefinition"],
      [recordsPath, "pivotCacheRecords"],
    ])
      overrides.push(
        `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`,
      );
    entries[`xl/worksheets/_rels/sheet${binding.sheet}.xml.rels`] = strToU8(
      `<Relationships xmlns="${PACKAGE_NS}"><Relationship Id="rIdNativePivot" Type="${REL_NS}/pivotTable" Target="../pivotTables/pivotTable${binding.pivot}.xml"/></Relationships>`,
    );
  }
  const workbookPath = "xl/workbook.xml";
  entries[workbookPath] = strToU8(
    strFromU8(entries[workbookPath]!).replace(
      "</workbook>",
      `<pivotCaches>${bindings.map((binding) => `<pivotCache cacheId="${binding.cacheId}" r:id="rIdNativeCache${binding.cacheId}"/>`).join("")}</pivotCaches></workbook>`,
    ),
  );
  const relsPath = "xl/_rels/workbook.xml.rels";
  entries[relsPath] = strToU8(
    strFromU8(entries[relsPath]!).replace(
      "</Relationships>",
      `${bindings.map((binding) => `<Relationship Id="rIdNativeCache${binding.cacheId}" Type="${REL_NS}/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition${binding.cache}.xml"/>`).join("")}</Relationships>`,
    ),
  );
  entries["[Content_Types].xml"] = strToU8(
    strFromU8(entries["[Content_Types].xml"]!).replace("</Types>", `${overrides.join("")}</Types>`),
  );
  return zipSync(entries);
}

return nativeFixture();
```
