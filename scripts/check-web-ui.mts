import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type WebUiViolation = {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".vue", ".css", ".scss"]);
const ignoredDirectories = new Set(["dist", "node_modules", ".git", "coverage"]);
const rawMenuExceptions = new Set(["apps/web/src/shared/borders/BorderLineStylePanel.vue"]);

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const details = statSync(path);
    if (details.isDirectory()) {
      if (!ignoredDirectories.has(entry)) files.push(...collectSourceFiles(path));
      continue;
    }

    if (sourceExtensions.has(entry.slice(entry.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function excerptAt(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const lineEnd = source.indexOf("\n", index);
  return source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
}

function addViolation(
  violations: WebUiViolation[],
  root: string,
  file: string,
  source: string,
  index: number,
  rule: string,
): void {
  violations.push({
    file: toPosixPath(relative(root, file)),
    line: lineNumber(source, index),
    rule,
    excerpt: excerptAt(source, index),
  });
}

function hasSharedFloatingOwnership(path: string): boolean {
  return toPosixPath(path).includes("/apps/web/src/shared/floating/");
}

function hasSharedMenuOwnership(relativePath: string): boolean {
  return (
    relativePath.startsWith("apps/web/src/shared/menu/") || rawMenuExceptions.has(relativePath)
  );
}

function checkFile(root: string, file: string, violations: WebUiViolation[]): void {
  const source = readFileSync(file, "utf8");
  const relativePath = toPosixPath(relative(root, file));

  if (!hasSharedFloatingOwnership(file)) {
    const floatingImport = /(?:\bfrom\s*|\bimport\s*\()(["'])@floating-ui\/(?:vue|dom)\1/gu;
    for (const match of source.matchAll(floatingImport)) {
      addViolation(
        violations,
        root,
        file,
        source,
        match.index ?? 0,
        "Import Floating UI only through shared/floating; extend its composables instead.",
      );
    }
  }

  if (!hasSharedMenuOwnership(relativePath)) {
    const rawMenu = /(?:^|[\s<])role\s*=\s*(["'])menu\1/gmu;
    for (const match of source.matchAll(rawMenu)) {
      addViolation(
        violations,
        root,
        file,
        source,
        match.index ?? 0,
        "Use MenuSurface for menu semantics; keep only its approved shared implementations raw.",
      );
    }
  }

  const numericOverlayLayer = /\bz-index\s*:\s*(?:3[1-9]|[4-9]\d|[1-9]\d{2,})\b/gu;
  for (const match of source.matchAll(numericOverlayLayer)) {
    addViolation(
      violations,
      root,
      file,
      source,
      match.index ?? 0,
      "Use an --idea-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
    );
  }
}

export function checkWebUi(root = workspaceRoot): WebUiViolation[] {
  const sourceDirectory = resolve(root, "apps/web/src");
  const violations: WebUiViolation[] = [];
  for (const file of collectSourceFiles(sourceDirectory)) {
    if (toPosixPath(relative(root, file)).includes("/src/tests/")) continue;
    checkFile(root, file, violations);
  }
  return violations;
}

export function formatWebUiViolations(violations: readonly WebUiViolation[]): string {
  return violations
    .map((violation) => {
      const sourceLine = violation.excerpt ? `\n  ${violation.excerpt}` : "";
      return `- ${violation.file}:${violation.line} ${violation.rule}${sourceLine}`;
    })
    .join("\n");
}

function main(): void {
  const violations = checkWebUi();
  if (violations.length > 0) {
    console.error("Web UI architecture check failed:");
    console.error(formatWebUiViolations(violations));
    process.exitCode = 1;
    return;
  }
  console.log("Web UI architecture passed.");
}

if (import.meta.main) main();
