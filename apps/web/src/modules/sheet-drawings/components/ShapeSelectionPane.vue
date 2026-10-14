<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from "vue";
import {
  BringToFront,
  Eye,
  EyeOff,
  Group,
  MoveDown,
  MoveUp,
  SendToBack,
  Shapes,
  Sigma,
  Type,
  X,
} from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import {
  shapeObjectControlsLabels,
  type ShapeObjectControlsLocale,
  type ShapeObjectOrderAction,
  type ShapeSelectionPaneRow,
} from "../shape-object-controls-contract";

const props = withDefaults(
  defineProps<{
    rows: readonly ShapeSelectionPaneRow[];
    ownerKey: string;
    draftOwnerKey?: string;
    disabled: boolean;
    locale?: ShapeObjectControlsLocale;
    selectHandler: (path: readonly string[], additive: boolean) => boolean;
    renameHandler: (path: readonly string[], name: string) => boolean;
    visibilityHandler?: (path: readonly string[], hidden: boolean) => boolean;
    allVisibilityHandler?: (hidden: boolean) => boolean;
    canToggleAllVisibility?: boolean;
    orderHandler: (action: ShapeObjectOrderAction) => boolean;
    closeHandler: () => boolean;
  }>(),
  { locale: "en-US" },
);
const labels = computed(() => shapeObjectControlsLabels(props.locale));
const paneId = `shape-selection-${useId()}`;
const ownerEpoch = ref(0);
const failure = ref("");
const drafts = reactive(new Map<string, NameDraft>());
const rowRevisions = new Map<string, number>();
const rowSources = new Map<string, string>();
let draftOwner = props.draftOwnerKey ?? props.ownerKey;
type NameDraft = {
  value: string;
  dirty: boolean;
  error: string;
  skipBlur: boolean;
};
function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}
function rowSource(row: ShapeSelectionPaneRow): string {
  return JSON.stringify([
    row.name,
    row.kind,
    row.canEdit,
    row.sourceKey,
    row.visible,
    row.hiddenByAncestor,
    row.canToggleVisibility,
  ]);
}
const hasSelection = computed(() => props.rows.some((row) => row.selected));
const orderDisabled = computed(
  () =>
    props.disabled || !hasSelection.value || props.rows.some((row) => row.selected && !row.canEdit),
);
watch(
  () => [
    props.ownerKey,
    props.draftOwnerKey,
    props.selectHandler,
    props.renameHandler,
    props.visibilityHandler,
    props.allVisibilityHandler,
    props.canToggleAllVisibility,
    props.orderHandler,
    props.closeHandler,
    props.disabled,
  ],
  () => {
    ownerEpoch.value++;
    const nextDraftOwner = props.draftOwnerKey ?? props.ownerKey;
    // A revision/metrics refresh retires callbacks, but an unchanged object can
    // retain its pending name. Sheet/workbook replacement always discards it.
    if (nextDraftOwner !== draftOwner || props.draftOwnerKey === undefined) drafts.clear();
    draftOwner = nextDraftOwner;
    failure.value = "";
  },
  { flush: "sync" },
);
watch(
  () => props.rows.map((row) => [pathKey(row.path), rowSource(row)]),
  () => {
    const currentKeys = new Set<string>();
    for (const row of props.rows) {
      const key = pathKey(row.path);
      const source = rowSource(row);
      currentKeys.add(key);
      if (source !== rowSources.get(key)) {
        rowRevisions.set(key, (rowRevisions.get(key) ?? 0) + 1);
        rowSources.set(key, source);
        drafts.delete(key);
      }
    }
    for (const key of rowSources.keys()) {
      if (currentKeys.has(key)) continue;
      rowSources.delete(key);
      rowRevisions.set(key, (rowRevisions.get(key) ?? 0) + 1);
      drafts.delete(key);
    }
  },
  { immediate: true, flush: "sync" },
);
function accepted(handler: () => boolean): boolean {
  try {
    return handler() === true;
  } catch {
    return false;
  }
}
const paneActions = computed(() => {
  const key = props.ownerKey;
  const epoch = ownerEpoch.value;
  const order = props.orderHandler;
  const close = props.closeHandler;
  const allVisibility = props.allVisibilityHandler;
  const selection = JSON.stringify(props.rows.filter((row) => row.selected).map((row) => row.path));
  function current(): boolean {
    return key === props.ownerKey && epoch === ownerEpoch.value;
  }
  function submit(action: ShapeObjectOrderAction) {
    if (
      !current() ||
      order !== props.orderHandler ||
      orderDisabled.value ||
      selection !== JSON.stringify(props.rows.filter((row) => row.selected).map((row) => row.path))
    )
      return;
    const success = accepted(() => order(action));
    if (current()) failure.value = success ? "" : labels.value.rejected;
  }
  return {
    allVisibility: (hidden: boolean) => {
      if (
        !current() ||
        props.disabled ||
        !props.canToggleAllVisibility ||
        !allVisibility ||
        allVisibility !== props.allVisibilityHandler
      )
        return;
      const success = accepted(() => allVisibility(hidden));
      if (current()) failure.value = success ? "" : labels.value.visibilityRejected;
    },
    front: () => submit("bring-front"),
    forward: () => submit("bring-forward"),
    backward: () => submit("send-backward"),
    back: () => submit("send-back"),
    close: () => {
      if (!current() || close !== props.closeHandler) return;
      const success = accepted(close);
      if (current()) failure.value = success ? "" : labels.value.rejected;
    },
  };
});
const renderedRows = computed(() => {
  const ownerKey = props.ownerKey;
  const epoch = ownerEpoch.value;
  const select = props.selectHandler;
  const rename = props.renameHandler;
  const visibility = props.visibilityHandler;
  return props.rows.map((source, index) => {
    const path = [...source.path];
    const key = pathKey(path);
    const revision = rowRevisions.get(key);
    const capturedSource = rowSource(source);
    function current(): boolean {
      const row = props.rows.find((entry) => pathKey(entry.path) === key);
      return (
        ownerKey === props.ownerKey &&
        epoch === ownerEpoch.value &&
        revision === rowRevisions.get(key) &&
        !!row &&
        rowSource(row) === capturedSource
      );
    }
    function editable(): boolean {
      return current() && !props.disabled && source.canEdit && rename === props.renameHandler;
    }
    function draft(): NameDraft {
      let value = drafts.get(key);
      if (!value) {
        value = { value: source.name, dirty: false, error: "", skipBlur: false };
        drafts.set(key, value);
      }
      return value;
    }
    function commit(): void {
      if (!editable()) return;
      const value = drafts.get(key);
      if (!value?.dirty) return;
      if (!value.value.trim()) {
        value.error = labels.value.nameRequired;
        return;
      }
      const submitted = value.value;
      const success = accepted(() => rename([...path], submitted));
      if (!current() || rename !== props.renameHandler || drafts.get(key) !== value) return;
      value.error = success ? "" : labels.value.renameRejected;
      if (success) value.dirty = false;
    }
    return {
      key,
      path,
      name: source.name,
      kind: source.kind,
      depth: Math.max(0, Number.isFinite(source.depth) ? Math.floor(source.depth) : 0),
      selected: source.selected,
      canEdit: source.canEdit,
      visible: source.visible !== false,
      hiddenByAncestor: source.hiddenByAncestor === true,
      canToggleVisibility: !!visibility && source.canToggleVisibility === true,
      toggleVisibility: () => {
        if (
          !current() ||
          props.disabled ||
          !source.canToggleVisibility ||
          !visibility ||
          visibility !== props.visibilityHandler
        )
          return;
        const success = accepted(() => visibility([...path], source.visible !== false));
        if (current()) failure.value = success ? "" : labels.value.visibilityRejected;
      },
      value: drafts.get(key)?.value ?? source.name,
      error: drafts.get(key)?.error ?? "",
      errorId: `${paneId}-name-${index}`,
      select: (event: MouseEvent | KeyboardEvent) => {
        if (!current() || props.disabled || select !== props.selectHandler) return;
        const success = accepted(() => select([...path], !!(event.ctrlKey || event.metaKey)));
        if (current()) failure.value = success ? "" : labels.value.selectRejected;
      },
      edit: (value: unknown) => {
        if (!editable() || typeof value !== "string") return;
        const state = draft();
        state.value = value;
        state.dirty = value !== source.name;
        state.error = "";
        state.skipBlur = false;
      },
      enter: () => {
        if (!editable()) return;
        draft().skipBlur = true;
        commit();
      },
      blur: () => {
        if (!editable()) return;
        const value = drafts.get(key);
        if (value?.skipBlur) {
          value.skipBlur = false;
          return;
        }
        commit();
      },
      keydown: (_value: unknown, context: { e: KeyboardEvent }) => {
        if (context.e.key !== "Escape" || !current()) return;
        context.e.preventDefault();
        context.e.stopPropagation();
        drafts.delete(key);
      },
    };
  });
});
</script>

<template>
  <aside
    class="shape-selection-pane"
    data-shape-selection-pane
    :data-shape-controls-owner="ownerKey"
    :aria-label="labels.selectionPane"
  >
    <header class="shape-selection-pane__header">
      <strong>{{ labels.selectionPane }}</strong>
      <TButton
        variant="text"
        shape="square"
        size="small"
        :aria-label="labels.close"
        data-shape-pane-close
        @click="paneActions.close"
        ><X :size="16"
      /></TButton>
    </header>
    <div class="shape-selection-pane__order" role="group" :aria-label="labels.order">
      <TButton
        variant="text"
        shape="square"
        size="small"
        :disabled="orderDisabled"
        :aria-label="labels.bringForward"
        :title="labels.bringForward"
        data-shape-pane-order="bring-forward"
        @click="paneActions.forward"
        ><MoveUp :size="16"
      /></TButton>
      <TButton
        variant="text"
        shape="square"
        size="small"
        :disabled="orderDisabled"
        :aria-label="labels.sendBackward"
        :title="labels.sendBackward"
        data-shape-pane-order="send-backward"
        @click="paneActions.backward"
        ><MoveDown :size="16"
      /></TButton>
      <TButton
        variant="text"
        shape="square"
        size="small"
        :disabled="orderDisabled"
        :aria-label="labels.bringFront"
        :title="labels.bringFront"
        data-shape-pane-order="bring-front"
        @click="paneActions.front"
        ><BringToFront :size="16"
      /></TButton>
      <TButton
        variant="text"
        shape="square"
        size="small"
        :disabled="orderDisabled"
        :aria-label="labels.sendBack"
        :title="labels.sendBack"
        data-shape-pane-order="send-back"
        @click="paneActions.back"
        ><SendToBack :size="16"
      /></TButton>
    </div>
    <div class="shape-selection-pane__visibility" role="group" :aria-label="labels.selectionPane">
      <TButton
        variant="text"
        size="small"
        :disabled="disabled || !canToggleAllVisibility"
        data-shape-pane-show-all
        @click="paneActions.allVisibility(false)"
        >{{ labels.showAll }}</TButton
      >
      <TButton
        variant="text"
        size="small"
        :disabled="disabled || !canToggleAllVisibility"
        data-shape-pane-hide-all
        @click="paneActions.allVisibility(true)"
        >{{ labels.hideAll }}</TButton
      >
    </div>
    <p class="shape-selection-pane__hint">{{ labels.selectionHint }}</p>
    <p
      v-if="failure"
      class="shape-selection-pane__failure"
      role="status"
      aria-live="polite"
      data-shape-pane-failure
    >
      {{ failure }}
    </p>
    <p v-if="!rows.length" class="shape-selection-pane__empty">{{ labels.empty }}</p>
    <ul v-else class="shape-selection-pane__list" :aria-label="labels.selectionPane">
      <li
        v-for="row in renderedRows"
        :key="row.key"
        class="shape-selection-pane__row"
        :class="{ 'is-selected': row.selected }"
        :style="{ '--shape-row-depth': row.depth }"
        :data-shape-pane-path="row.key"
      >
        <div class="shape-selection-pane__row-controls" @click="row.select">
          <TButton
            variant="text"
            shape="square"
            size="small"
            :disabled="disabled"
            :aria-label="`${labels.select} ${row.name}`"
            :aria-pressed="row.selected"
            :title="labels[row.kind]"
            data-shape-pane-select
            @click.stop="row.select"
          >
            <Group v-if="row.kind === 'shapeGroup'" :size="16" /><Type
              v-else-if="row.kind === 'textBox'"
              :size="16"
            /><Sigma v-else-if="row.kind === 'equation'" :size="16" /><Shapes v-else :size="16" />
          </TButton>
          <TButton
            variant="text"
            shape="square"
            size="small"
            :disabled="disabled || !row.canToggleVisibility"
            :aria-label="`${row.visible ? labels.hide : labels.show}: ${row.name}`"
            :aria-pressed="row.visible"
            :title="
              row.hiddenByAncestor
                ? labels.inheritedHidden
                : row.visible
                  ? labels.hide
                  : labels.show
            "
            data-shape-pane-visibility
            @click.stop="row.toggleVisibility"
          >
            <Eye v-if="row.visible" :size="16" /><EyeOff v-else :size="16" />
          </TButton>
          <TInput
            :model-value="row.value"
            :disabled="disabled || !row.canEdit"
            :aria-label="`${labels.name}: ${row.name}`"
            :aria-invalid="!!row.error"
            :aria-describedby="row.error ? row.errorId : undefined"
            :title="row.name"
            size="small"
            data-shape-pane-name
            @click.stop
            @change="row.edit"
            @enter="row.enter"
            @blur="row.blur"
            @keydown="row.keydown"
          />
        </div>
        <p
          v-if="row.error"
          :id="row.errorId"
          class="shape-selection-pane__failure shape-selection-pane__row-error"
          role="status"
          aria-live="polite"
        >
          {{ row.error }}
        </p>
      </li>
    </ul>
  </aside>
</template>

<style scoped lang="scss">
.shape-selection-pane {
  display: flex;
  flex: 0 0 300px;
  flex-direction: column;
  width: 300px;
  min-height: 0;
  padding: var(--sheetcraft-tool-panel-padding);
  border-left: 1px solid var(--sheetcraft-border-subtle);
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-primary);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sheetcraft-space-2);
    strong {
      min-width: 0;
      font-size: var(--sheetcraft-font-size-body-large);
      line-height: var(--sheetcraft-line-height-body-large);
      font-weight: 600;
    }
  }
  &__order,
  &__visibility {
    display: flex;
    gap: var(--sheetcraft-space-1);
    margin-top: var(--sheetcraft-space-2);
  }
  &__hint,
  &__empty,
  &__failure {
    margin: var(--sheetcraft-space-2) 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    overflow-wrap: anywhere;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__failure {
    color: var(--sheetcraft-status-error);
  }
  &__list {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    list-style: none;
    padding: 0;
    margin: var(--sheetcraft-space-2) 0 0;
  }
  &__row {
    padding: var(--sheetcraft-space-1);
    &.is-selected {
      background: var(--sheetcraft-surface-active);
    }
  }
  &__row-controls {
    display: grid;
    grid-template-columns: 28px 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--sheetcraft-space-1);
    padding-left: min(calc(var(--shape-row-depth) * 14px), 84px);
    min-width: 0;
  }
  &__row-error {
    margin-left: 32px;
  }
}
</style>
