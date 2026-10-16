import { describe, expect, test } from "vitest";
import {
  CompatibilityReportBuilder,
  mergeCompatibilityReports,
  MAX_PICTURE_GEOMETRY_ISSUES,
} from "../../report.js";
import type { XlsxCompatibilityReport } from "../../types.js";
const code = "picture-geometry-approximated";
const location = (index: number) => `Pictures.floatingImages["picture-${index}"].anchor`;
const total = (report: XlsxCompatibilityReport, selected = code) =>
  report.issues
    .filter((issue) => issue.code === selected)
    .reduce((count, issue) => count + issue.count, 0);
function pictures(count: number) {
  const builder = new CompatibilityReportBuilder();
  for (let index = 0; index < count; index++) builder.add(code, "warning", location(index));
  return builder;
}
describe("bounded per-picture geometry warnings", () => {
  test("shows all twelve object locations separately without column warnings consuming their slots", () => {
    const builder = pictures(12);
    for (let index = 0; index < 20; index++)
      builder.add("dimension-approximated", "warning", `Pictures!Column${index}`);
    const report = builder.build();
    const imageIssues = report.issues.filter((issue) => issue.code === code);
    expect(imageIssues).toHaveLength(12);
    expect(imageIssues.map((issue) => issue.locations[0])).toEqual(
      Array.from({ length: 12 }, (_, index) => location(index)),
    );
    expect(imageIssues.every((issue) => issue.count === 1 && issue.locations.length === 1)).toBe(
      true,
    );
    const dimensions = report.issues.find((issue) => issue.code === "dimension-approximated")!;
    expect(dimensions.count).toBe(20);
    expect(dimensions.locations).toHaveLength(10);
    expect(mergeCompatibilityReports(report)).toEqual(report);
  });

  test("limits object groups to128 plus one overflow summary while preserving total and omitted-location counts", () => {
    const builder = pictures(145),
      report = builder.build();
    expect(report.issues).toHaveLength(MAX_PICTURE_GEOMETRY_ISSUES + 1);
    expect(total(report)).toBe(145);
    const summary = report.issues.at(-1)!;
    expect(summary.count).toBe(17);
    expect(summary.locations).toEqual(
      Array.from({ length: 10 }, (_, index) => location(128 + index)),
    );
    expect(summary.count - summary.locations.length).toBe(7);
    expect(mergeCompatibilityReports(report)).toEqual(report);
    // Duplicate identities, including an undisplayed overflow identity, are
    // known inside the live builder and must not inflate its unique-object count.
    builder.add(code, "warning", location(0));
    builder.add(code, "warning", location(144));
    expect(builder.build()).toEqual(report);
  });

  test("deduplicates identified objects across reports and retains ordinary occurrence counts", () => {
    const first = pictures(12);
    first.add("dimension-approximated", "warning", "Pictures!A");
    const second = new CompatibilityReportBuilder();
    second.add(code, "warning", location(0));
    second.add(code, "warning", location(12));
    second.add("dimension-approximated", "warning", "Pictures!A");
    const merged = mergeCompatibilityReports(first.build(), second.build());
    expect(total(merged)).toBe(13);
    expect(merged.issues.filter((issue) => issue.code === code)).toHaveLength(13);
    expect(total(merged, "dimension-approximated")).toBe(2);
  });

  test("merges truncated anonymous occurrences arithmetically without pretending their identities are known", () => {
    const report = pictures(145).build();
    const duplicateKnown = new CompatibilityReportBuilder();
    duplicateKnown.add(code, "warning", location(128));
    expect(total(mergeCompatibilityReports(report, duplicateKnown.build()))).toBe(145);
    const anonymous: XlsxCompatibilityReport = {
      issues: [{ code, severity: "warning", count: 1_000_000, locations: [] }],
    };
    const merged = mergeCompatibilityReports(report, anonymous);
    expect(total(merged)).toBe(1_000_145);
    expect(merged.issues).toHaveLength(129);
    expect(merged.issues.at(-1)!.locations).toHaveLength(10);
    expect(merged.issues.at(-1)!.count).toBe(1_000_017);
  });

  test("bounds identity tracking by the admitted native object budget", () => {
    const builder = pictures(1_000);
    builder.add(code, "warning", location(999));
    expect(total(builder.build())).toBe(1_000);
    expect(builder.build().issues).toHaveLength(129);
    expect(() => builder.add(code, "warning", location(1_000))).toThrow(/object budget/);
  });
});
