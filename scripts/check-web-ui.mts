import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileString } from "sass";

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
const sharedSurfaceFiles = new Set([
  "apps/web/src/shared/floating/FloatingPanelSurface.vue",
  "apps/web/src/shared/menu/MenuSurface.vue",
]);
const protectedSurfaceProperty = /^(?:(?:padding|border|background)(?:-|$)|box-shadow$)/u;

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

function staticSurfaceClasses(source: string): Map<string, number> {
  const classes = new Map<string, number>();
  const surfaceTag = /<(?:MenuSurface|FloatingPanelSurface)\b([\s\S]*?)>/gu;
  for (const tag of source.matchAll(surfaceTag)) {
    const attributes = tag[1];
    const tagIndex = tag.index ?? 0;
    for (const match of attributes.matchAll(/(?:^|\s)class\s*=\s*(["'])(.*?)\1/gu)) {
      for (const className of match[2].split(/\s+/u)) {
        if (className) classes.set(className, tagIndex);
      }
    }
    for (const match of attributes.matchAll(/:class\s*=\s*(["'])([\s\S]*?)\1/gu)) {
      for (const className of match[2].matchAll(/["']([^"']+)["']/gu)) {
        classes.set(className[1], tagIndex);
      }
    }
  }
  return classes;
}

function isSurfaceSelector(selector: string, className: string): boolean {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`\\.${escapedClass}(?![-_a-zA-Z0-9])`, "u").exec(selector);
  if (!match) return false;
  const suffix = selector.slice((match.index ?? 0) + match[0].length);
  return !/[\s>+~]|::/u.test(suffix);
}

function checkSurfaceStyles(
  root: string,
  file: string,
  source: string,
  relativePath: string,
  violations: WebUiViolation[],
): void {
  if (sharedSurfaceFiles.has(relativePath)) return;
  const surfaceClasses = staticSurfaceClasses(source);
  if (surfaceClasses.size === 0) return;

  const styleBlocks = [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gu)];
  for (const style of styleBlocks) {
    const css = compileString(style[1], {
      quietDeps: true,
      url: pathToFileURL(file),
    }).css;
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
      const selectors = rule[1]
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
      const surfaceClass = [...surfaceClasses.keys()].find((className) =>
        selectors.some((selector) => isSurfaceSelector(selector, className)),
      );
      if (!surfaceClass) continue;
      for (const declaration of rule[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:/gu)) {
        const property = declaration[1];
        if (!protectedSurfaceProperty.test(property)) continue;
        addViolation(
          violations,
          root,
          file,
          source,
          surfaceClasses.get(surfaceClass) ?? 0,
          `Keep direct ${property} styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.`,
        );
      }
    }
  }
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

  checkSurfaceStyles(root, file, source, relativePath, violations);

  const numericOverlayLayer = /\bz-index\s*:\s*(?:3[1-9]|[4-9]\d|[1-9]\d{2,})\b/gu;
  for (const match of source.matchAll(numericOverlayLayer)) {
    addViolation(
      violations,
      root,
      file,
      source,
      match.index ?? 0,
      "Use an --sheetcraft-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
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
