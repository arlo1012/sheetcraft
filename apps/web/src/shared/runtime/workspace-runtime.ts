import { inject, provide, type InjectionKey, type Ref } from "vue";
import type { WorkbookCommand, WorkbookOperation } from "@sheetcraft/core/commands";
import type {
  ReplaceableWorkbookCommandResult,
  ReplaceableWorkbookCommandToken,
} from "@sheetcraft/core/history";
import type {
  CellAddress,
  CellRange,
  Sheet,
  SheetEvaluator,
  Workbook,
} from "@sheetcraft/core/workbook";
import {
  createInteractionCoordinator,
  type InteractionCoordinator,
} from "./interaction-coordinator";
import { createTypedEventBus, type TypedEventBus } from "./typed-event-bus";

export type WorkspaceFeedbackLevel = "info" | "success" | "warning" | "error";
export type WorkspaceClipboardOwner = "cell" | "picture" | "shape";
export type WorkspaceFormatPaneId =
  | "chart"
  | "picture"
  | "shape"
  | "pivotFields"
  | "pictureSelection"
  | "shapeSelection";

export type WorkspaceEvents = {
  "command:executed": {
    source: "execute" | "replaceable" | "undo" | "redo";
    operation?: WorkbookOperation;
    sheetId: string;
    revision: number;
  };
  "sheet:switched": {
    previousSheetId: string;
    sheetId: string;
  };
  "workbook:replaced": {
    generation: number;
  };
  "clipboard:claimed": {
    owner: WorkspaceClipboardOwner;
  };
  "pane:opened": {
    pane: WorkspaceFormatPaneId;
  };
  "feedback:notify": {
    level: WorkspaceFeedbackLevel;
    message: string;
  };
};

export type WorkspaceRuntimeOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getActiveAddress: () => CellAddress;
  getSelectionRange: () => CellRange;
  getEvaluator: () => SheetEvaluator;
  workbookGeneration: Readonly<Ref<number>>;
  workbookRevision: Readonly<Ref<number>>;
  isBusy: () => boolean;
  executeCommand: (command: WorkbookCommand, operation?: WorkbookOperation) => boolean;
  executeReplaceableCommand: (
    command: WorkbookCommand,
    token?: ReplaceableWorkbookCommandToken,
  ) => ReplaceableWorkbookCommandResult;
  undo: () => boolean;
  redo: () => boolean;
  selectSheet: (sheetId: string) => void;
  focusGrid: () => void;
  notify: (level: WorkspaceFeedbackLevel, message: string) => void;
  events?: TypedEventBus<WorkspaceEvents>;
};

export type WorkspaceRuntime = {
  readonly events: TypedEventBus<WorkspaceEvents>;
  readonly coordinator: InteractionCoordinator<WorkspaceFormatPaneId, WorkspaceClipboardOwner>;
  readonly workbookGeneration: Readonly<Ref<number>>;
  readonly workbookRevision: Readonly<Ref<number>>;
  readonly getWorkbook: () => Workbook;
  readonly getActiveSheet: () => Sheet;
  readonly getActiveAddress: () => CellAddress;
  readonly getSelectionRange: () => CellRange;
  readonly getEvaluator: () => SheetEvaluator;
  readonly isBusy: () => boolean;
  readonly executeCommand: (command: WorkbookCommand, operation?: WorkbookOperation) => boolean;
  readonly executeReplaceableCommand: (
    command: WorkbookCommand,
    token?: ReplaceableWorkbookCommandToken,
  ) => ReplaceableWorkbookCommandResult;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly selectSheet: (sheetId: string) => void;
  readonly focusGrid: () => void;
  readonly notify: (level: WorkspaceFeedbackLevel, message: string) => void;
};

export const workspaceRuntimeKey: InjectionKey<WorkspaceRuntime> = Symbol(
  "sheetcraft.workspaceRuntime",
);

/** Creates a workspace-scoped runtime combining typed domain events, interaction coordination, and document capabilities. */
export function createWorkspaceRuntime(options: WorkspaceRuntimeOptions): WorkspaceRuntime {
  const events = options.events ?? createTypedEventBus<WorkspaceEvents>();
  const coordinator = createInteractionCoordinator<WorkspaceFormatPaneId, WorkspaceClipboardOwner>({
    onPaneOpened: (pane) => events.emit("pane:opened", { pane }),
    onClipboardClaimed: (owner) => events.emit("clipboard:claimed", { owner }),
  });

  function notify(level: WorkspaceFeedbackLevel, message: string): void {
    events.emit("feedback:notify", { level, message });
    options.notify(level, message);
  }

  return {
    events,
    coordinator,
    workbookGeneration: options.workbookGeneration,
    workbookRevision: options.workbookRevision,
    getWorkbook: options.getWorkbook,
    getActiveSheet: options.getActiveSheet,
    getActiveAddress: options.getActiveAddress,
    getSelectionRange: options.getSelectionRange,
    getEvaluator: options.getEvaluator,
    isBusy: options.isBusy,
    executeCommand: options.executeCommand,
    executeReplaceableCommand: options.executeReplaceableCommand,
    undo: options.undo,
    redo: options.redo,
    selectSheet: options.selectSheet,
    focusGrid: options.focusGrid,
    notify,
  };
}

export function provideWorkspaceRuntime(runtime: WorkspaceRuntime): void {
  provide(workspaceRuntimeKey, runtime);
}

/** Optional injection so standalone child components and unit tests still mount cleanly without a workspace host. */
export function useWorkspaceRuntime(): WorkspaceRuntime | undefined {
  return inject(workspaceRuntimeKey, undefined);
}

export function useRequiredWorkspaceRuntime(): WorkspaceRuntime {
  const runtime = useWorkspaceRuntime();
  if (!runtime) {
    throw new Error("WorkspaceRuntime is not provided in the current Vue component tree.");
  }
  return runtime;
}
