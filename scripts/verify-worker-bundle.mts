import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type PackageManifest = {
  name: string;
  exports?: Record<string, unknown>;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function verifyWorkerRoundTrip(outputPath: string): Promise<number> {
  const worker = new Worker(pathToFileURL(outputPath).href, { type: "module" });
  try {
    return await new Promise<number>((resolveValue, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker message round trip timed out.")),
        5_000,
      );
      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timeout);
        if (typeof event.data !== "number" || !Number.isFinite(event.data) || event.data <= 0) {
          reject(new Error(`Worker returned an invalid export count: ${String(event.data)}.`));
          return;
        }
        resolveValue(event.data);
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(event.error ?? new Error(event.message));
      };
      worker.postMessage(null);
    });
  } finally {
    worker.terminate();
  }
}

function readPackage(relativeDirectory: string, required: boolean): PackageManifest | undefined {
  const packageDirectory = resolve(workspaceRoot, relativeDirectory);
  const manifestPath = join(packageDirectory, "package.json");
  if (!existsSync(manifestPath)) {
    if (required) {
      throw new Error(`Required package manifest is missing: ${relativeDirectory}/package.json`);
    }
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  if (!manifest.name || !manifest.exports) {
    throw new Error(`Package ${relativeDirectory} must declare a name and exports.`);
  }
  const rootExport = manifest.exports["."] as { import?: string } | undefined;
  if (!rootExport?.import || !existsSync(join(packageDirectory, rootExport.import))) {
    throw new Error(
      `Package ${manifest.name} is not built. Run its build script before this check.`,
    );
  }
  return manifest;
}

function linkPackageForConsumer(
  temporaryDirectory: string,
  relativePackageDirectory: string,
  manifest: PackageManifest,
): void {
  const linkPath = resolve(temporaryDirectory, "node_modules", ...manifest.name.split("/"));
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(
    resolve(workspaceRoot, relativePackageDirectory),
    linkPath,
    process.platform === "win32" ? "junction" : "dir",
  );
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined") {
    throw new Error("This verification requires Bun. Run: bun scripts/verify-worker-bundle.mts");
  }

  const core = readPackage("packages/core", true);
  if (!core) {
    throw new Error("Required package @idea10/core could not be loaded.");
  }
  const sheetEngine = readPackage("packages/sheet-engine", false);
  const temporaryDirectory = mkdtempSync(join(workspaceRoot, ".worker-bundle-smoke-"));

  try {
    linkPackageForConsumer(temporaryDirectory, "packages/core", core);
    if (sheetEngine) {
      linkPackageForConsumer(temporaryDirectory, "packages/sheet-engine", sheetEngine);
    }
    const entryPath = join(temporaryDirectory, "consumer.mjs");
    const imports = [`import * as core from ${JSON.stringify(core.name)};`];
    const values = ["Object.keys(core).length"];
    if (sheetEngine) {
      imports.push(`import * as sheetEngine from ${JSON.stringify(sheetEngine.name)};`);
      values.push("Object.keys(sheetEngine).length");
    }
    writeFileSync(
      entryPath,
      `${imports.join("\n")}

self.addEventListener("message", () => {
  self.postMessage(${values.join(" + ")});
});
`,
    );

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: join(temporaryDirectory, "dist"),
      target: "browser",
      format: "esm",
      splitting: false,
      sourcemap: "none",
      minify: false,
    });
    if (!result.success) {
      const diagnostics = result.logs.map((log) => log.message).join("\n");
      throw new Error(`Browser-target Worker bundle failed:\n${diagnostics}`);
    }
    if (result.outputs.length === 0) {
      throw new Error("Browser-target Worker bundle produced no output.");
    }

    const output = await result.outputs[0]?.text();
    if (!output) {
      throw new Error("Browser-target Worker bundle output could not be read.");
    }
    if (/\bnode:[a-z_]+\b/u.test(output)) {
      throw new Error("Browser-target Worker bundle still references a Node builtin.");
    }

    const exportedMemberCount = await verifyWorkerRoundTrip(result.outputs[0].path);

    console.log(
      `Worker browser bundle and message round trip passed for ${[core.name, sheetEngine?.name].filter(Boolean).join(", ")} (${exportedMemberCount} exports).`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(`Worker browser bundle verification failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
