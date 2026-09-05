import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type PackageManifest = {
  name: string;
  exports?: Record<string, unknown>;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectories = ["packages/core", "packages/sheet-engine", "packages/xlsx-io"];

function collectExportTargets(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap((entry) => collectExportTargets(entry));
}

function runNodeImport(directory: string, specifier: string): { ok: boolean; output: string } {
  const result = spawnSync(
    "node",
    ["--input-type=module", "--eval", `await import(${JSON.stringify(specifier)});`],
    {
      cwd: directory,
      encoding: "utf8",
    },
  );
  return {
    ok: result.status === 0 && !result.error,
    output: [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim(),
  };
}

function requireBuiltPackage(directory: string): PackageManifest {
  const manifestPath = resolve(directory, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing package manifest: ${relative(workspaceRoot, manifestPath)}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  if (!manifest.name || !manifest.exports) {
    throw new Error(
      `Package ${relative(workspaceRoot, directory)} must declare a name and exports.`,
    );
  }
  const missingTargets = collectExportTargets(manifest.exports).filter(
    (target) => target.startsWith("./dist/") && !existsSync(resolve(directory, target)),
  );
  if (missingTargets.length > 0) {
    throw new Error(
      `Package ${manifest.name} is not built. Missing: ${missingTargets.join(", ")}. Run its build script first.`,
    );
  }
  return manifest;
}

function getPublicSpecifiers(manifest: PackageManifest): string[] {
  return Object.keys(manifest.exports ?? {}).map((subpath) =>
    subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`,
  );
}

function linkPackageForConsumer(
  directory: string,
  packageDirectory: string,
  manifest: PackageManifest,
): void {
  const linkPath = resolve(directory, "node_modules", ...manifest.name.split("/"));
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(packageDirectory, linkPath, process.platform === "win32" ? "junction" : "dir");
}

function verifyPackageImports(
  directory: string,
  manifests: Array<{ packageDirectory: string; manifest: PackageManifest }>,
): string[] {
  for (const { packageDirectory, manifest } of manifests) {
    linkPackageForConsumer(directory, packageDirectory, manifest);
  }

  const failures: string[] = [];
  for (const { manifest } of manifests) {
    let publicImportsPassed = true;
    for (const specifier of getPublicSpecifiers(manifest)) {
      const result = runNodeImport(directory, specifier);
      if (!result.ok) {
        publicImportsPassed = false;
        failures.push(`Node could not import public export ${specifier}:\n${result.output}`);
      }
    }

    if (!publicImportsPassed) {
      continue;
    }
    const deepSpecifier = `${manifest.name}/src/index.js`;
    const deepImport = runNodeImport(directory, deepSpecifier);
    if (deepImport.ok || !/ERR_PACKAGE_PATH_NOT_EXPORTED/u.test(deepImport.output)) {
      failures.push(
        `Package exports must reject deep source import ${deepSpecifier}. Received:\n${deepImport.output || "success"}`,
      );
    }
  }
  return failures;
}

function main(): void {
  const manifests: Array<{ packageDirectory: string; manifest: PackageManifest }> = [];
  for (const relativeDirectory of packageDirectories) {
    const directory = resolve(workspaceRoot, relativeDirectory);
    if (!existsSync(directory)) {
      if (relativeDirectory.endsWith("sheet-engine")) {
        continue;
      }
      throw new Error(`Required package directory is missing: ${relativeDirectory}`);
    }
    const manifest = requireBuiltPackage(directory);
    manifests.push({ packageDirectory: directory, manifest });
  }

  const temporaryDirectory = mkdtempSync(join(workspaceRoot, ".package-import-smoke-"));
  const failures = (() => {
    try {
      return verifyPackageImports(temporaryDirectory, manifests);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  })();

  if (failures.length > 0) {
    console.error("Built package import verification failed:");
    for (const failure of failures) {
      console.error(`\n${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Built package imports passed for ${manifests.map(({ manifest }) => manifest.name).join(", ")}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Built package import verification failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
