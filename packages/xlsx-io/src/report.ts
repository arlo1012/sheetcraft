import type {
  XlsxCompatibilityCode,
  XlsxCompatibilityIssue,
  XlsxCompatibilityReport,
  XlsxCompatibilitySeverity,
} from "./types.js";

const MAX_LOCATIONS_PER_ISSUE = 10;
export const MAX_PICTURE_GEOMETRY_ISSUES = 128;
// Matches the native-picture object budget. Tracking identities stays bounded
// even when only the first 128 objects and ten overflow examples are displayed.
const MAX_TRACKED_PICTURE_GEOMETRY_OBJECTS = 1_000;
type MutableIssue = {
  code: XlsxCompatibilityCode;
  severity: XlsxCompatibilitySeverity;
  count: number;
  locations: string[];
};

export class CompatibilityReportBuilder {
  private readonly issues = new Map<string, MutableIssue>();
  private readonly pictureLocations = new Set<string>();
  private pictureIssueCount = 0;

  private append(
    key: string,
    code: XlsxCompatibilityCode,
    severity: XlsxCompatibilitySeverity,
    count: number,
    locations: readonly string[],
  ): void {
    if (!Number.isSafeInteger(count) || count < 1)
      throw new RangeError("Compatibility issue counts must be positive safe integers.");
    const issue = this.issues.get(key) ?? { code, severity, count: 0, locations: [] };
    if (!Number.isSafeInteger(issue.count + count))
      throw new RangeError("Compatibility issue count exceeds finite bounds.");
    issue.count += count;
    issue.locations.push(...locations.slice(0, MAX_LOCATIONS_PER_ISSUE - issue.locations.length));
    this.issues.set(key, issue);
  }

  add(
    code: XlsxCompatibilityCode,
    severity: XlsxCompatibilitySeverity,
    issueLocation?: string,
  ): void {
    if (code === "picture-geometry-approximated" && severity === "warning") {
      if (!issueLocation) {
        this.append(`${severity}:${code}:overflow`, code, severity, 1, []);
        return;
      }
      const identity = `${severity}:${issueLocation}`;
      if (this.pictureLocations.has(identity)) return;
      if (this.pictureLocations.size >= MAX_TRACKED_PICTURE_GEOMETRY_OBJECTS)
        throw new RangeError("Picture geometry warnings exceed the native object budget.");
      this.pictureLocations.add(identity);
      const key =
        this.pictureIssueCount < MAX_PICTURE_GEOMETRY_ISSUES
          ? `${severity}:${code}:object:${issueLocation}`
          : `${severity}:${code}:overflow`;
      this.pictureIssueCount += 1;
      this.append(key, code, severity, 1, [issueLocation]);
      return;
    }
    this.append(`${severity}:${code}`, code, severity, 1, issueLocation ? [issueLocation] : []);
  }

  /**
   * Identified picture locations deduplicate across reports. Truncated anonymous
   * occurrences retain their count: their identities cannot be reconstructed or
   * honestly claimed to have been deduplicated. No loop scales with issue.count.
   */
  mergeIssue(issue: XlsxCompatibilityIssue): void {
    if (
      !Number.isSafeInteger(issue.count) ||
      issue.count < 1 ||
      issue.locations.length > issue.count
    )
      throw new RangeError("Invalid compatibility issue count.");
    if (issue.code === "picture-geometry-approximated" && issue.severity === "warning") {
      for (const location of issue.locations) this.add(issue.code, issue.severity, location);
      const anonymousCount = issue.count - issue.locations.length;
      if (anonymousCount)
        this.append(
          `${issue.severity}:${issue.code}:overflow`,
          issue.code,
          issue.severity,
          anonymousCount,
          [],
        );
      return;
    }
    this.append(
      `${issue.severity}:${issue.code}`,
      issue.code,
      issue.severity,
      issue.count,
      issue.locations,
    );
  }

  build(): XlsxCompatibilityReport {
    const issues: XlsxCompatibilityIssue[] = [...this.issues.values()]
      .sort(
        (left, right) =>
          left.severity.localeCompare(right.severity) || left.code.localeCompare(right.code),
      )
      .map((issue) => ({ ...issue, locations: [...issue.locations] }));
    return { issues };
  }

  hasBlocks(): boolean {
    return [...this.issues.values()].some((issue) => issue.severity === "block");
  }
}

export function mergeCompatibilityReports(
  ...reports: readonly XlsxCompatibilityReport[]
): XlsxCompatibilityReport {
  const builder = new CompatibilityReportBuilder();
  for (const report of reports) for (const issue of report.issues) builder.mergeIssue(issue);
  return builder.build();
}
