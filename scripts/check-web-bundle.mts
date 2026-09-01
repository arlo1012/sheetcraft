import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

type AssetBudget = {
  maximumRawBytes: number;
  maximumGzipBytes: number;
  pattern?: string;
};

type BundleBudgetConfig = {
  distDirectory: string;
  entryAssets: {
    javascript: AssetBudget;
    css: AssetBudget;
  };
  totalAssets: {
    javascript: AssetBudget;
    css: AssetBudget;
  };
};

type AssetSize = {
  name: string;
  rawBytes: number;
  gzipBytes: number;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(workspaceRoot, "config/bundle-budgets.json");

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString("en-US")} B`;
}

function getAssetSizes(directory: string, extension: ".js" | ".css"): AssetSize[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .map((name) => {
      const path = resolve(directory, name);
      const contents = readFileSync(path);
      return {
        name,
        rawBytes: statSync(path).size,
        gzipBytes: gzipSync(contents, { level: 9 }).length,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function checkBudget(label: string, sizes: readonly AssetSize[], budget: AssetBudget): string[] {
  const rawBytes = sizes.reduce((total, size) => total + size.rawBytes, 0);
  const gzipBytes = sizes.reduce((total, size) => total + size.gzipBytes, 0);
  const errors: string[] = [];
  if (rawBytes > budget.maximumRawBytes) {
    errors.push(
      `${label} raw size ${formatBytes(rawBytes)} exceeds ${formatBytes(budget.maximumRawBytes)}`,
    );
  }
  if (gzipBytes > budget.maximumGzipBytes) {
    errors.push(
      `${label} gzip size ${formatBytes(gzipBytes)} exceeds ${formatBytes(budget.maximumGzipBytes)}`,
    );
  }
  return errors;
}

function getEntryAsset(
  label: string,
  assets: readonly AssetSize[],
  budget: AssetBudget,
): AssetSize {
  const pattern = new RegExp(budget.pattern ?? "");
  const matches = assets.filter((asset) => pattern.test(asset.name));
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${label} entry asset matching ${budget.pattern}, found ${matches.length}.`,
    );
  }
  return matches[0] as AssetSize;
}

function main(): void {
  if (!existsSync(configPath)) {
    throw new Error(`Missing bundle budget configuration: ${relative(workspaceRoot, configPath)}`);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as BundleBudgetConfig;
  const assetsDirectory = resolve(workspaceRoot, config.distDirectory, "assets");
  if (!existsSync(assetsDirectory)) {
    throw new Error(
      `Missing Web build assets: ${relative(workspaceRoot, assetsDirectory)}. Run the Web build first.`,
    );
  }

  const javascriptAssets = getAssetSizes(assetsDirectory, ".js");
  const cssAssets = getAssetSizes(assetsDirectory, ".css");
  const entryJavaScript = getEntryAsset(
    "JavaScript",
    javascriptAssets,
    config.entryAssets.javascript,
  );
  const entryCss = getEntryAsset("CSS", cssAssets, config.entryAssets.css);
  const errors = [
    ...checkBudget("entry JavaScript", [entryJavaScript], config.entryAssets.javascript),
    ...checkBudget("entry CSS", [entryCss], config.entryAssets.css),
    ...checkBudget("total JavaScript", javascriptAssets, config.totalAssets.javascript),
    ...checkBudget("total CSS", cssAssets, config.totalAssets.css),
  ];

  console.log("Web bundle sizes:");
  for (const asset of [...javascriptAssets, ...cssAssets]) {
    console.log(
      `- ${asset.name}: raw ${formatBytes(asset.rawBytes)}, gzip ${formatBytes(asset.gzipBytes)}`,
    );
  }

  if (errors.length > 0) {
    console.error("Web bundle budget check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Web bundle budgets passed.");
}

try {
  main();
} catch (error) {
  console.error(`Web bundle budget check failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
