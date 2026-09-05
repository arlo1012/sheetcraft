import { fileURLToPath } from "node:url";

type ChildProcess = ReturnType<typeof Bun.spawn>;

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const bunExecutable = process.execPath;
const tscExecutable = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const viteExecutable = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const coreProject = "packages/core/tsconfig.build.json";
const sheetEngineProject = "packages/sheet-engine/tsconfig.build.json";
const viteArguments = process.argv.slice(2);
const children = new Map<string, ChildProcess>();
let activeBuild: ChildProcess | undefined;
let stopping = false;

function startChild(name: string, command: string[], cwd = workspaceRoot): ChildProcess {
  const child = Bun.spawn(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  children.set(name, child);
  void child.exited.then((exitCode) => {
    if (!stopping) {
      console.error(`${name} exited unexpectedly with code ${exitCode}.`);
      void stop(exitCode === 0 ? 1 : exitCode);
    }
  });
  return child;
}

async function runInitialBuild(project: string): Promise<void> {
  const child = Bun.spawn([bunExecutable, tscExecutable, "-b", project], {
    cwd: workspaceRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  activeBuild = child;
  const exitCode = await child.exited;
  activeBuild = undefined;
  if (exitCode !== 0) {
    throw new Error(`${project} initial build failed with code ${exitCode}.`);
  }
}

async function stop(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;

  activeBuild?.kill("SIGTERM");
  for (const child of children.values()) {
    child.kill("SIGTERM");
  }
  const runningChildren = [...children.values()];
  const forceStopTimer = setTimeout(() => {
    activeBuild?.kill("SIGKILL");
    for (const child of runningChildren) {
      child.kill("SIGKILL");
    }
  }, 5_000);
  await Promise.all([
    ...(activeBuild ? [activeBuild.exited] : []),
    ...runningChildren.map((child) => child.exited),
  ]);
  clearTimeout(forceStopTimer);
  process.exit(exitCode);
}

function installSignalHandler(signal: NodeJS.Signals): void {
  process.once(signal, () => {
    void stop(0);
  });
}

async function main(): Promise<void> {
  installSignalHandler("SIGINT");
  installSignalHandler("SIGTERM");

  await runInitialBuild(coreProject);
  if (stopping) return;
  await runInitialBuild(sheetEngineProject);
  if (stopping) return;

  startChild("package watcher", [
    bunExecutable,
    tscExecutable,
    "-b",
    coreProject,
    sheetEngineProject,
    "--watch",
    "--preserveWatchOutput",
  ]);
  startChild(
    "Vite",
    [bunExecutable, viteExecutable, ...viteArguments],
    fileURLToPath(new URL("../apps/web", import.meta.url)),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  void stop(1);
});
