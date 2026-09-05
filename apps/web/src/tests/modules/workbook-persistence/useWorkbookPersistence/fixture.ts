import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type Workbook,
} from "@idea10/core/workbook";
import {
  useWorkbookPersistence,
  type UseWorkbookPersistenceOptions,
} from "../../../../modules/workbook-persistence/useWorkbookPersistence";
import type {
  PersistedWorkbook,
  WorkbookSaveReceipt,
  WorkbookStore,
} from "../../../../modules/workbook-persistence/workbookStore";

export function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

export function createWorkbookWithValue(value?: string): Workbook {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  if (value !== undefined) {
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, { kind: "literal", value });
  }
  return workbook;
}

export function createPersistedWorkbook(
  value: string,
  revision = 1,
  savedAt = 1_700_000_000_000,
): PersistedWorkbook {
  return { revision, savedAt, snapshot: serializeWorkbook(createWorkbookWithValue(value)) };
}

export function createStore(overrides: Partial<WorkbookStore> = {}): WorkbookStore {
  return {
    load: async () => undefined,
    save: async (_snapshot, expectedRevision) => ({
      revision: (expectedRevision ?? 0) + 1,
      savedAt: 1_700_000_000_000,
    }),
    replace: async () => ({
      revision: 1,
      savedAt: 1_700_000_000_000,
    }),
    ...overrides,
  };
}

export function mountPersistence(options: {
  store: WorkbookStore;
  workbook?: Workbook;
  debounceMs?: number;
}) {
  let workbook = options.workbook ?? createWorkbookWithValue();
  const revision = ref(0);
  let persistence: ReturnType<typeof useWorkbookPersistence> | undefined;
  const replaceCalls: Workbook[] = [];
  const controllerOptions: UseWorkbookPersistenceOptions = {
    store: options.store,
    getWorkbook: () => workbook,
    getRevision: () => revision.value,
    replaceWorkbook: (nextWorkbook) => {
      workbook = nextWorkbook;
      replaceCalls.push(nextWorkbook);
      revision.value += 1;
    },
    debounceMs: options.debounceMs,
  };
  const wrapper = mount(
    defineComponent({
      setup() {
        persistence = useWorkbookPersistence(controllerOptions);
        return () => h("div");
      },
    }),
  );
  if (!persistence) {
    throw new Error("Workbook persistence did not initialize.");
  }

  function edit(value: string): void {
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, { kind: "literal", value });
    revision.value += 1;
  }

  function value(): string | undefined {
    const content = getActiveSheet(workbook).cells.get("0:0")?.content;
    return content?.kind === "literal" && typeof content.value === "string"
      ? content.value
      : undefined;
  }

  return {
    edit,
    getWorkbook: () => workbook,
    persistence,
    replaceCalls,
    value,
    wrapper,
  };
}

export function asReceipt(revision: number, savedAt = 1_700_000_000_000): WorkbookSaveReceipt {
  return { revision, savedAt };
}

export function savedCellValue(save: { mock: { calls: unknown[][] } }, callIndex: number): string {
  const snapshot = save.mock.calls[callIndex]?.[0] as WorkbookSnapshot | undefined;
  const content = snapshot?.sheets[0]?.cells[0]?.content;
  if (!content || content.kind !== "literal" || typeof content.value !== "string") {
    throw new Error("Expected a saved literal cell value.");
  }
  return content.value;
}
