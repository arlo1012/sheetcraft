<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from "vue";
import { arePictureObjectsEqual } from "@sheetcraft/core/picture-object";
import { cloneFloatingImage } from "@sheetcraft/core/workbook";
import { Eye, EyeOff, X } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { isPictureGroup } from "@sheetcraft/core";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
const props = defineProps<{
  images: readonly FloatingImage[];
  selectedIds: readonly string[];
  disabled: boolean;
  canEditImage?: (image: FloatingImage) => boolean;
  renameHandler?: (image: FloatingImage, name: string) => boolean;
  visibilityHandler?: (image: FloatingImage) => boolean;
  selectHandler?: (ids: string[]) => boolean;
  closeHandler?: () => boolean;
}>();
const emit = defineEmits<{
  select: [ids: string[]];
  visibility: [image: FloatingImage];
  rename: [image: FloatingImage, name: string];
  close: [];
}>();
const { t } = useAppI18n();
const paneId = `picture-selection-${useId()}`;
const ownerEpoch = ref(0);
const failure = ref("");
type NameDraft = { value: string; dirty: boolean; error: string; skipBlur: boolean };
const drafts = reactive(new Map<string, NameDraft>());
const rowSources = new Map<string, FloatingImage>();
const rowRevisions = new Map<string, number>();
watch(
  () => [
    props.renameHandler,
    props.visibilityHandler,
    props.selectHandler,
    props.closeHandler,
    props.canEditImage,
  ],
  () => {
    ownerEpoch.value++;
    drafts.clear();
    failure.value = "";
  },
  { flush: "sync" },
);
watch(
  () => props.disabled,
  () => {
    ownerEpoch.value++;
    failure.value = "";
  },
  { flush: "sync" },
);
watch(
  () => props.images.map((image) => image),
  (images) => {
    const ids = new Set(images.map((image) => image.id));
    for (const image of images) {
      if (rowSources.get(image.id) === image) continue;
      rowSources.set(image.id, image);
      rowRevisions.set(image.id, (rowRevisions.get(image.id) ?? 0) + 1);
      drafts.delete(image.id);
    }
    for (const id of rowSources.keys()) {
      if (ids.has(id)) continue;
      rowSources.delete(id);
      rowRevisions.set(id, (rowRevisions.get(id) ?? 0) + 1);
      drafts.delete(id);
    }
  },
  { immediate: true, flush: "sync" },
);
function available(image: FloatingImage): boolean {
  const current = props.images.find((entry) => entry.id === image.id);
  return !!current && props.canEditImage?.(current) !== false;
}
function accepted(handler: () => boolean): boolean {
  try {
    return handler() === true;
  } catch {
    return false;
  }
}
const callbacks = computed(() => {
  const epoch = ownerEpoch.value;
  const rename = props.renameHandler;
  const visibility = props.visibilityHandler;
  const select = props.selectHandler;
  const close = props.closeHandler;
  const current = () => epoch === ownerEpoch.value;
  function report(success: boolean): void {
    if (current()) failure.value = success ? "" : t("picture.operationFailed");
  }
  return {
    current,
    rename: (image: FloatingImage, name: string): boolean => {
      if (!current() || props.disabled || !available(image) || rename !== props.renameHandler)
        return false;
      if (rename) return accepted(() => rename(cloneFloatingImage(image), name));
      emit("rename", image, name);
      return true;
    },
    visibility: (image: FloatingImage) => {
      if (
        !current() ||
        props.disabled ||
        !available(image) ||
        visibility !== props.visibilityHandler
      )
        return;
      if (visibility) report(accepted(() => visibility(cloneFloatingImage(image))));
      else emit("visibility", image);
    },
    select: (ids: string[]) => {
      if (
        !current() ||
        props.disabled ||
        select !== props.selectHandler ||
        ids.some((id) => !props.images.some((image) => image.id === id && available(image)))
      )
        return;
      if (select) report(accepted(() => select(ids)));
      else emit("select", ids);
    },
    close: () => {
      if (!current() || close !== props.closeHandler) return;
      if (close) report(accepted(close));
      else emit("close");
    },
  };
});
const closeAction = computed(() => callbacks.value.close);
const selectableIds = computed(() => props.images.filter(available).map((image) => image.id));
const selectAllAction = computed(() => {
  const owner = callbacks.value;
  const ids = [...selectableIds.value];
  return () => {
    if (JSON.stringify(ids) === JSON.stringify(selectableIds.value) && ids.length)
      owner.select(ids);
  };
});
// Keep one detached source per rendered root, separate from reactive name drafts.
const sources = computed(() =>
  [...props.images].reverse().map((entry) => ({
    source: entry,
    image: cloneFloatingImage(entry),
  })),
);
const rows = computed(() => {
  const owner = callbacks.value;
  return sources.value.map(({ source, image }, index) => {
    const id = image.id;
    const revision = rowRevisions.get(id);
    const name = image.altText || id;
    function current(): boolean {
      const value = props.images.find((entry) => entry.id === id);
      return (
        owner.current() &&
        revision === rowRevisions.get(id) &&
        !!value &&
        value === source &&
        arePictureObjectsEqual(value, image)
      );
    }
    function editable(): boolean {
      return current() && !props.disabled && available(image);
    }
    function draft(): NameDraft {
      let state = drafts.get(id);
      if (!state) {
        state = { value: name, dirty: false, error: "", skipBlur: false };
        drafts.set(id, state);
      }
      return state;
    }
    function commit(): void {
      if (!editable()) return;
      const state = drafts.get(id);
      if (!state?.dirty) return;
      if (!state.value.trim()) {
        state.error = t("picture.nameRequired");
        return;
      }
      const success = owner.rename(image, state.value);
      if (!current() || drafts.get(id) !== state) return;
      state.error = success ? "" : t("picture.renameRejected");
      if (success) state.dirty = false;
    }
    return {
      image,
      value: drafts.get(id)?.value ?? name,
      error: drafts.get(id)?.error ?? "",
      errorId: `${paneId}-name-${index}`,
      edit: (value: unknown) => {
        if (!editable() || typeof value !== "string") return;
        const state = draft();
        state.value = value;
        state.dirty = value !== name;
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
        const state = drafts.get(id);
        if (state?.skipBlur) {
          state.skipBlur = false;
          return;
        }
        commit();
      },
      keydown: (_value: unknown, context: { e: KeyboardEvent }) => {
        if (context.e.key !== "Escape" || !current()) return;
        context.e.preventDefault();
        context.e.stopPropagation();
        drafts.delete(id);
      },
      visibility: () => {
        if (current()) owner.visibility(image);
      },
      select: () => {
        if (!current() || !available(image)) return;
        // Owned groups are root selections; groupId only relates standalone pictures.
        const groupId = isPictureGroup(image) ? undefined : image.groupId;
        const members = groupId
          ? props.images
              .filter((entry) => !isPictureGroup(entry) && entry.groupId === groupId)
              .map((entry) => entry.id)
          : [id];
        const rootIds = new Set(props.images.map((entry) => entry.id));
        const selected = props.selectedIds.filter((value) => rootIds.has(value));
        owner.select(
          selected.includes(id)
            ? selected.filter((value) => !members.includes(value))
            : [...new Set([...selected, ...members])],
        );
      },
    };
  });
});
</script>
<template>
  <aside class="picture-selection-pane" :aria-label="t('picture.selectionPane')">
    <header class="picture-selection-pane__header">
      <strong>{{ t("picture.selectionPane") }}</strong
      ><TButton variant="text" shape="square" :aria-label="t('picture.close')" @click="closeAction"
        ><X :size="16"
      /></TButton>
    </header>
    <TButton
      size="small"
      variant="text"
      :disabled="disabled || !selectableIds.length"
      @click="selectAllAction"
      >{{ t("picture.selectAll") }}</TButton
    >
    <p v-if="failure" class="picture-selection-pane__failure" role="status" aria-live="polite">
      {{ failure }}
    </p>
    <p v-if="!images.length">{{ t("picture.noPictures") }}</p>
    <ul class="picture-selection-pane__list">
      <li
        v-for="row in rows"
        :key="row.image.id"
        class="picture-selection-pane__row"
        :class="{ 'is-selected': selectedIds.includes(row.image.id) }"
      >
        <TCheckbox
          :disabled="disabled || !available(row.image)"
          :model-value="selectedIds.includes(row.image.id)"
          :aria-label="row.image.altText || row.image.id"
          @change="row.select"
        />
        <div class="picture-selection-pane__name">
          <TInput
            v-native-control="{
              attributes: {
                'aria-label': t('picture.name'),
                'aria-invalid': row.error ? 'true' : undefined,
                'aria-describedby': row.error ? row.errorId : undefined,
              },
            }"
            :model-value="row.value"
            :status="row.error ? 'error' : 'default'"
            size="small"
            :disabled="disabled || !available(row.image)"
            @change="row.edit"
            @enter="row.enter"
            @blur="row.blur"
            @keydown="row.keydown"
          />
          <p
            v-if="row.error"
            :id="row.errorId"
            class="picture-selection-pane__failure"
            role="status"
            aria-live="polite"
          >
            {{ row.error }}
          </p>
        </div>
        <TButton
          size="small"
          variant="text"
          shape="square"
          :disabled="disabled || !available(row.image)"
          :aria-label="t(row.image.hidden ? 'picture.show' : 'picture.hide')"
          @click="row.visibility"
          ><EyeOff v-if="row.image.hidden" :size="16" /><Eye v-else :size="16"
        /></TButton>
      </li>
    </ul>
  </aside>
</template>
<style scoped lang="scss">
.picture-selection-pane {
  display: flex;
  flex-direction: column;
  width: 280px;
  flex: 0 0 280px;
  min-height: 0;
  padding: 8px;
  border-left: 1px solid var(--sheetcraft-border-subtle);
  background: var(--sheetcraft-surface-panel);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__list {
    padding: 0;
    margin: 8px 0;
    list-style: none;
    overflow: auto;
  }
  &__name {
    flex: 1;
    min-width: 0;
  }
  &__failure {
    margin: var(--sheetcraft-space-1) 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    color: var(--sheetcraft-status-error);
    overflow-wrap: anywhere;
  }
  &__row {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 4px;
    &.is-selected {
      background: var(--sheetcraft-surface-hover);
    }
  }
}
</style>
