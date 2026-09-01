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
const packageSourceDirectories = ["packages/core/src", "packages/sheet-engine/src"];
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

  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (character === "/" && nextCharacter === "/") {
      const end = source.indexOf("\n", index + 2);
      replaceRange(index, end === -1 ? source.length : end);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      const closingIndex = source.indexOf("*/", index + 2);
      const end = closingIndex === -1 ? source.length : closingIndex + 2;
      replaceRange(index, end);
      index = end;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      let end = index + 1;
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
      replaceRange(index, end);
      index = end;
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

function checkRuntimeNeutralPackage(path: string, violations: Violation[]): void {
  const source = readFileSync(path, "utf8");

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2] ?? match[4];
    if (!specifier) {
      continue;
    }
    const moduleName = specifier.replace(/^node:/u, "").split("/")[0] ?? specifier;
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
    if (/^@idea10\/(?:core|sheet-engine)\/src(?:\/|$)/u.test(specifier)) {
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
  const violations: Violation[] = [];
  const checkedPackageDirectories: string[] = [];

  for (const relativeDirectory of packageSourceDirectories) {
    const directory = resolve(workspaceRoot, relativeDirectory);
    const files = collectSourceFiles(directory);
    if (files.length > 0) {
      checkedPackageDirectories.push(relativeDirectory);
      for (const file of files) {
        if (toPosixPath(relative(workspaceRoot, file)).includes("/src/tests/")) {
          continue;
        }
        checkRuntimeNeutralPackage(file, violations);
      }
    }
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
