import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbook, type Workbook } from "@idea10/core/workbook";
import { useWorkbookFileActions } from "../../../../modules/workbook-persistence/useWorkbookFileActions";
import type { useWorkbookPersistence } from "../../../../modules/workbook-persistence/useWorkbookPersistence";

type Persistence = ReturnType<typeof useWorkbookPersistence>;

export function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

export function createWorkbookFile(text: () => Promise<string>): Pick<File, "text"> {
  return { text };
}

export function mountFileActions(options?: {
  workbook?: Workbook;
  flushPendingEdits?: () => boolean;
  hasPendingEdits?: () => boolean;
}) {
  const workbook = options?.workbook ?? createWorkbook({ idFactory: createSequentialIdFactory() });
  const loading = ref(false);
  const dirty = ref(false);
  const saveNow = vi.fn(async () => true);
  const reload = vi.fn(async () => false);
  const replaceDocument = vi.fn(async (_workbook: Workbook) => {});
  const persistence = {
    loading,
    dirty,
    saveNow,
    reload,
    replaceDocument,
  } as unknown as Persistence;
  const flushPendingEdits = vi.fn(options?.flushPendingEdits ?? (() => true));
  const hasPendingEdits = vi.fn(options?.hasPendingEdits ?? (() => false));
  let actions: ReturnType<typeof useWorkbookFileActions> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        actions = useWorkbookFileActions({
          persistence,
          getWorkbook: () => workbook,
          flushPendingEdits,
          hasPendingEdits,
        });
        return () => h("div");
      },
    }),
  );
  if (!actions) {
    throw new Error("Workbook file actions did not initialize.");
  }

  return {
    actions,
    dirty,
    flushPendingEdits,
    hasPendingEdits,
    persistence: { loading, saveNow, reload, replaceDocument },
    workbook,
    wrapper,
  };
}
