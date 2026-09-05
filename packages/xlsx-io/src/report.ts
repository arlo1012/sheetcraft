import type {
  XlsxCompatibilityCode,
  XlsxCompatibilityIssue,
  XlsxCompatibilityReport,
  XlsxCompatibilitySeverity,
} from "./types.js";

const MAX_LOCATIONS_PER_ISSUE = 10;

export class CompatibilityReportBuilder {
  private readonly issues = new Map<
    string,
    {
      code: XlsxCompatibilityCode;
      severity: XlsxCompatibilitySeverity;
      count: number;
      locations: string[];
    }
  >();

  add(
    code: XlsxCompatibilityCode,
    severity: XlsxCompatibilitySeverity,
    issueLocation?: string,
  ): void {
    const key = `${severity}:${code}`;
    const issue = this.issues.get(key) ?? { code, severity, count: 0, locations: [] };
    issue.count += 1;
    if (issueLocation && issue.locations.length < MAX_LOCATIONS_PER_ISSUE)
      issue.locations.push(issueLocation);
    this.issues.set(key, issue);
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
  for (const report of reports) {
    for (const issue of report.issues) {
      for (let index = 0; index < issue.count; index += 1)
        builder.add(issue.code, issue.severity, issue.locations[index]);
    }
  }
  return builder.build();
}
