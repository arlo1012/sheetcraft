import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { createWorkbook, createWorkbookEvaluator, getActiveSheet } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import { createInteractionCoordinator } from "../../../shared/runtime/interaction-coordinator";
import {
  createTypedEventBus,
  useScopedEventListener,
} from "../../../shared/runtime/typed-event-bus";
import {
  createWorkspaceRuntime,
  type WorkspaceEvents,
} from "../../../shared/runtime/workspace-runtime";

describe("typed-event-bus", () => {
  it("dispatches events synchronously and handles unsubscribe mid-dispatch safely", () => {
    const bus = createTypedEventBus<{ ping: number; done: string }>();
    const calls: number[] = [];
    let unsubFirst: (() => void) | undefined;

    unsubFirst = bus.on("ping", (value) => {
      calls.push(value * 10);
      unsubFirst?.();
    });
    bus.on("ping", (value) => {
      calls.push(value);
    });

    bus.emit("ping", 2);
    bus.emit("ping", 3);

    expect(calls).toEqual([20, 2, 3]);
  });

  it("supports once and automatic Vue scope disposal", () => {
    const bus = createTypedEventBus<{ tick: number }>();
    const onceCalls: number[] = [];
    const scopedCalls: number[] = [];

    bus.once("tick", (value) => onceCalls.push(value));

    const scope = effectScope();
    scope.run(() => {
      useScopedEventListener(bus, "tick", (value) => scopedCalls.push(value));
    });

    bus.emit("tick", 1);
    bus.emit("tick", 2);
    scope.stop();
    bus.emit("tick", 3);

    expect(onceCalls).toEqual([1]);
    expect(scopedCalls).toEqual([1, 2]);
  });
});

describe("interaction-coordinator", () => {
  it("flushes active edit participants in descending priority order and stops on veto", () => {
    const coordinator = createInteractionCoordinator();
    const order: string[] = [];
    let allowLow = true;

    coordinator.registerEditParticipant({
      id: "cell",
      priority: 10,
      isActive: () => true,
      flush: () => {
        order.push("cell");
        return allowLow;
      },
    });
    coordinator.registerEditParticipant({
      id: "shape-text",
      priority: 30,
      isActive: () => true,
      flush: () => {
        order.push("shape-text");
        return false;
      },
    });
    coordinator.registerEditParticipant({
      id: "equation",
      priority: 20,
      isActive: () => true,
      flush: () => {
        order.push("equation");
        return true;
      },
    });

    expect(coordinator.flushActiveEdits()).toBe(false);
    expect(order).toEqual(["shape-text"]);

    order.length = 0;
    expect(coordinator.flushActiveEdits(["shape-text"])).toBe(true);
    expect(order).toEqual(["equation", "cell"]);

    allowLow = false;
    order.length = 0;
    expect(coordinator.flushActiveEdits(["shape-text"])).toBe(false);
    expect(order).toEqual(["equation", "cell"]);
  });

  it("closes competing panes and clears competing clipboard owners", () => {
    const opened: string[] = [];
    const claimed: string[] = [];
    const coordinator = createInteractionCoordinator<
      "chart" | "picture" | "shape",
      "cell" | "picture" | "shape"
    >({
      onPaneOpened: (pane) => opened.push(pane),
      onClipboardClaimed: (owner) => claimed.push(owner),
    });

    const closeChart = vi.fn();
    const closePicture = vi.fn();
    const closeShape = vi.fn();
    coordinator.registerPane("chart", closeChart);
    coordinator.registerPane("picture", closePicture);
    coordinator.registerPane("shape", closeShape);

    coordinator.notifyPaneOpened("chart");
    expect(closeChart).not.toHaveBeenCalled();
    expect(closePicture).toHaveBeenCalledTimes(1);
    expect(closeShape).toHaveBeenCalledTimes(1);
    expect(coordinator.activePane.value).toBe("chart");
    expect(opened).toEqual(["chart"]);

    const clearCell = vi.fn();
    const clearPicture = vi.fn();
    const clearShape = vi.fn();
    coordinator.registerClipboardOwner("cell", clearCell);
    coordinator.registerClipboardOwner("picture", clearPicture);
    coordinator.registerClipboardOwner("shape", clearShape);

    coordinator.claimClipboard("shape");
    expect(clearCell).toHaveBeenCalledTimes(1);
    expect(clearPicture).toHaveBeenCalledTimes(1);
    expect(clearShape).not.toHaveBeenCalled();
    expect(coordinator.activeClipboardOwner.value).toBe("shape");
    expect(claimed).toEqual(["shape"]);
  });
});

describe("workspace-runtime", () => {
  it("bridges coordinator actions and feedback notifications onto typed workspace events", () => {
    const idFactory = createBrowserIdFactory();
    const workbook = createWorkbook({ idFactory });
    const sheet = getActiveSheet(workbook);
    const generation = ref(0);
    const revision = ref(0);
    const notifySpy = vi.fn();
    const received: Array<{ type: keyof WorkspaceEvents; payload: unknown }> = [];

    const runtime = createWorkspaceRuntime({
      getWorkbook: () => workbook,
      getActiveSheet: () => sheet,
      getActiveAddress: () => ({ row: 0, column: 0 }),
      getSelectionRange: () => ({ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }),
      getEvaluator: () => createWorkbookEvaluator(workbook, sheet.id),
      workbookGeneration: generation,
      workbookRevision: revision,
      isBusy: () => false,
      executeCommand: () => true,
      executeReplaceableCommand: () => ({ changed: true, accepted: true }),
      undo: () => true,
      redo: () => true,
      selectSheet: () => {},
      focusGrid: () => {},
      notify: notifySpy,
    });

    runtime.events.on("pane:opened", (payload) => received.push({ type: "pane:opened", payload }));
    runtime.events.on("clipboard:claimed", (payload) =>
      received.push({ type: "clipboard:claimed", payload }),
    );
    runtime.events.on("feedback:notify", (payload) =>
      received.push({ type: "feedback:notify", payload }),
    );

    const closePicture = vi.fn();
    runtime.coordinator.registerPane("picture", closePicture);
    runtime.coordinator.notifyPaneOpened("chart");
    runtime.coordinator.claimClipboard("cell");
    runtime.notify("success", "Saved");

    expect(closePicture).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith("success", "Saved");
    expect(received).toEqual([
      { type: "pane:opened", payload: { pane: "chart" } },
      { type: "clipboard:claimed", payload: { owner: "cell" } },
      { type: "feedback:notify", payload: { level: "success", message: "Saved" } },
    ]);
  });
});
