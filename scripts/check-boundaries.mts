import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type Violation = {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
};

type BrowserGlobalReference = {
  index: number;
  name: string;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".vue", ".css", ".scss"]);
const ignoredDirectories = new Set(["dist", "node_modules", ".git", "coverage"]);
const runtimePackages = [
  {
    name: "@sheetcraft/core",
    sourceDirectory: "packages/core/src",
    manifest: "packages/core/package.json",
  },
  {
    name: "@sheetcraft/sheet-engine",
    sourceDirectory: "packages/sheet-engine/src",
    manifest: "packages/sheet-engine/package.json",
  },
  {
    name: "@sheetcraft/xlsx-io",
    sourceDirectory: "packages/xlsx-io/src",
    manifest: "packages/xlsx-io/package.json",
  },
] as const;
const forbiddenRuntimeImports = [
  /^vue(?:\/|$)/u,
  /^@vue\//u,
  /^tdesign-vue-next(?:\/|$)/u,
  /^@floating-ui\//u,
  /^vue-i18n(?:\/|$)/u,
];
const nodeBuiltinModules = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);
const browserGlobalPattern =
  /\b(?:window|document|navigator|localStorage|sessionStorage|location|history|ClipboardEvent|DataTransfer|HTMLElement|HTML[A-Za-z]+Element|Element|Node|CanvasRenderingContext2D|OffscreenCanvas|ResizeObserver|MutationObserver|requestAnimationFrame|cancelAnimationFrame|matchMedia)\b/gu;
const importPattern =
  /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)(["'])([^"']+)\1|\bexport(?:\s+type)?(?:\s*\*)?(?:\s*\{[^}]*\})?\s+from\s*(["'])([^"']+)\3/gu;

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const details = statSync(path);
    if (details.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        files.push(...collectSourceFiles(path));
      }
      continue;
    }

    const extension = entry.slice(entry.lastIndexOf("."));
    if (sourceExtensions.has(extension)) {
      files.push(path);
    }
  }
  return files;
}

function findLineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function maskNonCodeText(source: string): string {
  const masked = source.split("");
  const replaceRange = (start: number, end: number): void => {
    for (let index = start; index < end; index += 1) {
      if (masked[index] !== "\n") {
        masked[index] = " ";
      }
    }
  };

  const skipQuotedString = (start: number, quote: "'" | '"'): number => {
    let end = start + 1;
    while (end < source.length) {
      if (source[end] === "\\") {
        end += 2;
        continue;
      }
      if (source[end] === quote) {
        end += 1;
        break;
      }
      end += 1;
    }
    replaceRange(start, end);
    return end;
  };

  const skipLineComment = (start: number): number => {
    const end = source.indexOf("\n", start + 2);
    const resolvedEnd = end === -1 ? source.length : end;
    replaceRange(start, resolvedEnd);
    return resolvedEnd;
  };

  const skipBlockComment = (start: number): number => {
    const closingIndex = source.indexOf("*/", start + 2);
    const end = closingIndex === -1 ? source.length : closingIndex + 2;
    replaceRange(start, end);
    return end;
  };

  const skipTemplateExpression = (start: number): number => {
    let depth = 1;
    let index = start;
    while (index < source.length) {
      const character = source[index];
      const nextCharacter = source[index + 1];
      if (character === "/" && nextCharacter === "/") {
        index = skipLineComment(index);
        continue;
      }
      if (character === "/" && nextCharacter === "*") {
        index = skipBlockComment(index);
        continue;
      }
      if (character === "'" || character === '"') {
        index = skipQuotedString(index, character);
        continue;
      }
      if (character === "`") {
        index = skipTemplateLiteral(index);
        continue;
      }
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          masked[index] = " ";
          return index + 1;
        }
      }
      index += 1;
    }
    return index;
  };

  const skipTemplateLiteral = (start: number): number => {
    masked[start] = " ";
    let index = start + 1;
    while (index < source.length) {
      const character = source[index];
      const nextCharacter = source[index + 1];
      if (character === "\\") {
        masked[index] = " ";
        if (nextCharacter && nextCharacter !== "\n") {
          masked[index + 1] = " ";
        }
        index += 2;
        continue;
      }
      if (character === "`") {
        masked[index] = " ";
        return index + 1;
      }
      if (character === "$" && nextCharacter === "{") {
        masked[index] = " ";
        masked[index + 1] = " ";
        index = skipTemplateExpression(index + 2);
        continue;
      }
      if (character !== "\n") {
        masked[index] = " ";
      }
      index += 1;
    }
    return index;
  };

  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (character === "/" && nextCharacter === "/") {
      index = skipLineComment(index);
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      index = skipBlockComment(index);
      continue;
    }
    if (character === "'" || character === '"') {
      index = skipQuotedString(index, character);
      continue;
    }
    if (character === "`") {
      index = skipTemplateLiteral(index);
      continue;
    }
    index += 1;
  }
  return masked.join("");
}

function isPropertyReference(source: string, index: number): boolean {
  let previousIndex = index - 1;
  while (previousIndex >= 0 && /\s/u.test(source[previousIndex] ?? "")) {
    previousIndex -= 1;
  }
  return source[previousIndex] === ".";
}

function isPropertyKey(source: string, index: number, name: string): boolean {
  let nextIndex = index + name.length;
  while (nextIndex < source.length && /\s/u.test(source[nextIndex] ?? "")) {
    nextIndex += 1;
  }
  if (source[nextIndex] === ":") {
    return true;
  }
  if (source[nextIndex] !== "?") {
    return false;
  }
  nextIndex += 1;
  while (nextIndex < source.length && /\s/u.test(source[nextIndex] ?? "")) {
    nextIndex += 1;
  }
  return source[nextIndex] === ":";
}

function getBrowserGlobalReferences(source: string): BrowserGlobalReference[] {
  const code = maskNonCodeText(source);
  const references: BrowserGlobalReference[] = [];
  for (const match of code.matchAll(browserGlobalPattern)) {
    const index = match.index ?? 0;
    const name = match[0];
    if (!isPropertyReference(code, index) && !isPropertyKey(code, index, name)) {
      references.push({ index, name });
    }
  }
  return references;
}

function assertBrowserGlobalDetection(): void {
  const operationCode = 'const operation = "history.restore";';
  const browserHistory = 'window.history.pushState({}, "", "/");';
  const bareHistory = 'history.pushState({}, "", "/");';
  const templateBrowserHistory = "const label = `${window.history.length}`;";
  if (getBrowserGlobalReferences(operationCode).length !== 0) {
    throw new Error("Boundary detector must ignore browser-global names inside string literals.");
  }
  if (
    getBrowserGlobalReferences(browserHistory).some((reference) => reference.name === "window") ===
    false
  ) {
    throw new Error("Boundary detector must reject window.history browser access.");
  }
  if (
    getBrowserGlobalReferences(bareHistory).some((reference) => reference.name === "history") ===
    false
  ) {
    throw new Error("Boundary detector must reject bare history browser access.");
  }
  if (
    getBrowserGlobalReferences(templateBrowserHistory).some(
      (reference) => reference.name === "window",
    ) === false
  ) {
    throw new Error("Boundary detector must reject browser access inside template interpolation.");
  }
}

function getDependencyDirectionViolation(
  packageName: string,
  specifier: string,
): string | undefined {
  if (packageName === "@sheetcraft/core") {
    if (/^@sheetcraft\/(?:sheet-engine|xlsx-io|web)(?:\/|$)/u.test(specifier)) {
      return `@sheetcraft/core must not depend on ${specifier}`;
    }
    return undefined;
  }
  if (packageName === "@sheetcraft/sheet-engine") {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      return undefined;
    }
    if (specifier === "@sheetcraft/core" || specifier.startsWith("@sheetcraft/core/")) {
      return undefined;
    }
    return `@sheetcraft/sheet-engine may only depend on @sheetcraft/core, not ${specifier}`;
  }
  if (packageName === "@sheetcraft/xlsx-io") {
    if (/^@sheetcraft\/(?:sheet-engine|web)(?:\/|$)/u.test(specifier)) {
      return `@sheetcraft/xlsx-io must not depend on ${specifier}`;
    }
    if (specifier.startsWith("exceljs/") && specifier !== "exceljs/dist/exceljs.min.js") {
      return "@sheetcraft/xlsx-io must use the audited ExcelJS browser artifact, never the Node entry";
    }
  }
  return undefined;
}

function assertDependencyDirection(): void {
  const rejectedCoreDependency = getDependencyDirectionViolation(
    "@sheetcraft/core",
    "@sheetcraft/sheet-engine/selection",
  );
  const rejectedSheetEngineDependency = getDependencyDirectionViolation(
    "@sheetcraft/sheet-engine",
    "@sheetcraft/web",
  );
  const allowedSheetEngineDependency = getDependencyDirectionViolation(
    "@sheetcraft/sheet-engine",
    "@sheetcraft/core/workbook",
  );
  if (!rejectedCoreDependency || !rejectedSheetEngineDependency || allowedSheetEngineDependency) {
    throw new Error("Boundary detector dependency-direction regression.");
  }
}

function addViolation(
  violations: Violation[],
  path: string,
  source: string,
  index: number,
  rule: string,
): void {
  const line = findLineNumber(source, index);
  const excerpt = source.split("\n")[line - 1]?.trim() ?? "";
  violations.push({
    file: toPosixPath(relative(workspaceRoot, path)),
    line,
    rule,
    excerpt,
  });
}

function checkRuntimeNeutralPackage(
  path: string,
  packageName: string,
  violations: Violation[],
): void {
  const source = readFileSync(path, "utf8");

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2] ?? match[4];
    if (!specifier) {
      continue;
    }
    const moduleName = specifier.replace(/^node:/u, "").split("/")[0] ?? specifier;
    if (packageName === "@sheetcraft/xlsx-io" && specifier === "exceljs") {
      addViolation(
        violations,
        path,
        source,
        match.index ?? 0,
        "XLSX IO must import the audited browser artifact, not the ExcelJS Node entry",
      );
    }
    if (forbiddenRuntimeImports.some((pattern) => pattern.test(specifier))) {
      addViolation(
        violations,
        path,
        source,
        match.index ?? 0,
        `runtime-neutral packages cannot import ${specifier}`,
      );
    }
    if (specifier.startsWith("node:") || nodeBuiltinModules.has(moduleName)) {
      addViolation(
        violations,
        path,
        source,
        match.index ?? 0,
        `runtime-neutral packages cannot import the Node builtin ${specifier}`,
      );
    }
    const dependencyDirectionViolation = getDependencyDirectionViolation(packageName, specifier);
    if (dependencyDirectionViolation) {
      addViolation(violations, path, source, match.index ?? 0, dependencyDirectionViolation);
    }
  }

  for (const match of getBrowserGlobalReferences(source)) {
    addViolation(
      violations,
      path,
      source,
      match.index,
      `runtime-neutral packages cannot reference browser global ${match.name}`,
    );
  }
}

function checkRuntimePackageManifest(
  manifestPath: string,
  packageName: string,
  violations: Violation[],
): void {
  if (!existsSync(manifestPath)) {
    return;
  }
  const source = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(source) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const dependencies = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
  for (const dependency of dependencies) {
    const dependencyDirectionViolation = getDependencyDirectionViolation(packageName, dependency);
    if (dependencyDirectionViolation) {
      addViolation(
        violations,
        manifestPath,
        source,
        source.indexOf(`"${dependency}"`),
        dependencyDirectionViolation,
      );
    }
  }
}

function isTdesignAdapter(path: string): boolean {
  const relativePath = toPosixPath(relative(workspaceRoot, path));
  return (
    relativePath === "apps/web/src/shared/styles/_tdesign.scss" ||
    relativePath.includes("/adapters/tdesign/") ||
    relativePath.includes("/shared/tdesign/")
  );
}

function checkWebSource(path: string, violations: Violation[]): void {
  if (toPosixPath(relative(workspaceRoot, path)).includes("/src/tests/")) {
    return;
  }
  const source = readFileSync(path, "utf8");

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2] ?? match[4];
    if (!specifier) {
      continue;
    }
    if (/^@sheetcraft\/(?:core|sheet-engine|xlsx-io)\/src(?:\/|$)/u.test(specifier)) {
      addViolation(
        violations,
        path,
        source,
        match.index ?? 0,
        `Web code must use a public package export instead of ${specifier}`,
      );
      continue;
    }

    if (specifier.startsWith(".")) {
      const importedPath = resolve(dirname(path), specifier);
      const packagesSourceRoot = resolve(workspaceRoot, "packages") + sep;
      if (importedPath.startsWith(packagesSourceRoot) && importedPath.includes(`${sep}src${sep}`)) {
        addViolation(
          violations,
          path,
          source,
          match.index ?? 0,
          `Web code must not deep-import package source ${specifier}`,
        );
      }
    }
  }

  if (isTdesignAdapter(path)) {
    return;
  }

  const tdesignInternalPattern =
    /--td-[A-Za-z0-9_-]+|:deep\(\s*\.t-[A-Za-z0-9_-]+|\.t-[A-Za-z0-9_-]+/gu;
  for (const match of source.matchAll(tdesignInternalPattern)) {
    addViolation(
      violations,
      path,
      source,
      match.index ?? 0,
      "Only the shared TDesign adapter may target --td-* or internal .t-* selectors",
    );
  }
}

function main(): void {
  assertBrowserGlobalDetection();
  assertDependencyDirection();
  const violations: Violation[] = [];
  const checkedPackageDirectories: string[] = [];

  for (const runtimePackage of runtimePackages) {
    const directory = resolve(workspaceRoot, runtimePackage.sourceDirectory);
    const files = collectSourceFiles(directory);
    if (files.length > 0) {
      checkedPackageDirectories.push(runtimePackage.sourceDirectory);
      for (const file of files) {
        if (toPosixPath(relative(workspaceRoot, file)).includes("/src/tests/")) {
          continue;
        }
        checkRuntimeNeutralPackage(file, runtimePackage.name, violations);
      }
    }
    checkRuntimePackageManifest(
      resolve(workspaceRoot, runtimePackage.manifest),
      runtimePackage.name,
      violations,
    );
  }

  const webSourceDirectory = resolve(workspaceRoot, "apps/web/src");
  for (const file of collectSourceFiles(webSourceDirectory)) {
    checkWebSource(file, violations);
  }

  const uniqueViolations = violations.filter(
    (violation, index) =>
      violations.findIndex(
        (candidate) =>
          candidate.file === violation.file &&
          candidate.line === violation.line &&
          candidate.rule === violation.rule,
      ) === index,
  );

  if (uniqueViolations.length > 0) {
    console.error("Architecture boundary check failed:");
    for (const violation of uniqueViolations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.rule}`);
      if (violation.excerpt) {
        console.error(`  ${violation.excerpt}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  const packageSummary =
    checkedPackageDirectories.length > 0 ? checkedPackageDirectories.join(", ") : "none yet";
  console.log(`Architecture boundaries passed (runtime-neutral packages: ${packageSummary}).`);
}

main();
