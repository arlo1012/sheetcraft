<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Omega } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import {
  symbolIdentity,
  useSymbolPreferences,
  withRecentSymbol,
  type SymbolInsertion,
} from "../symbols/symbol-preferences";
const props = defineProps<{
  disabled: boolean;
  editSessionId?: string;
  insertText?: (payload: SymbolInsertion) => boolean;
}>();
const emit = defineEmits<{ more: []; insert: [payload: SymbolInsertion] }>();
const { t } = useAppI18n();
const { preferences, update, storageError } = useSymbolPreferences();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `symbol-insert-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
const visibleCustom = computed(() => preferences.value.custom.filter((entry) => entry.visible));
const fontError = ref(false);
const localLabels = ref<Record<string, string>>({});
const busy = ref(false);
let openingGeneration = 0;
watch(
  open,
  () => {
    openingGeneration++;
    busy.value = false;
    fontError.value = false;
    if (
      open.value &&
      [...preferences.value.recent, ...preferences.value.custom].some((item) =>
        item.fontFamily?.startsWith("SheetcraftLocal_"),
      )
    ) {
      const generation = openingGeneration;
      void import("../../../shared/cell-text/local-font-source")
        .then((source) => {
          if (generation !== openingGeneration) return;
          localLabels.value = Object.fromEntries(
            source
              .useLocalSymbolFonts()
              .fonts.value.map((font) => [font.family, font.displayFamily]),
          );
        })
        .catch(() => {
          /* Reading labels is optional; inserting still verifies the font. */
        });
    }
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  openingGeneration++;
});
async function insert(item: SymbolInsertion): Promise<void> {
  if (props.disabled || busy.value) return;
  const generation = openingGeneration;
  const handler = props.insertText;
  const ownerId = props.editSessionId;
  busy.value = true;
  fontError.value = false;
  try {
    if (item.fontFamily) {
      const resources = await import("../../../shared/cell-text/font-resources");
      if (resources.getCellFontResourceKind(item.fontFamily) === "system")
        throw new Error("Symbol font coverage has not been verified");
      await resources.retryCellFontResource(item.fontFamily);
    }
    if (
      props.disabled ||
      !open.value ||
      generation !== openingGeneration ||
      handler !== props.insertText ||
      ownerId !== props.editSessionId
    )
      return;
    const payload: SymbolInsertion = {
      text: item.text,
      ...(item.fontFamily ? { fontFamily: item.fontFamily } : {}),
    };
    if (handler) {
      if (!handler(payload)) return;
    } else emit("insert", payload);
    update(withRecentSymbol(preferences.value, item));
    dismiss("programmatic", false);
  } catch {
    if (generation === openingGeneration) fontError.value = true;
  } finally {
    if (generation === openingGeneration) busy.value = false;
  }
}
function more(): void {
  emit("more");
  dismiss("programmatic", false);
}
function title(item: SymbolInsertion): string {
  return `${item.text} · ${item.fontFamily ? (localLabels.value[item.fontFamily] ?? item.fontFamily) : t("symbolTools.inherited")}`;
}
</script>
<template>
  <span class="symbol-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('drawing.symbol')"
      :text="t('drawing.symbol')"
      :disabled="disabled"
      variant="tall"
      data-insert-tool="symbol"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Omega aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="symbol-menu"
        :label="t('drawing.symbol')"
        :data-cell-edit-session="editSessionId"
      >
        <template #body>
          <div class="symbol-menu__section">
            <div class="symbol-menu__label">{{ t("symbolTools.recent") }}</div>
            <div class="symbol-menu__grid">
              <button
                v-for="item in preferences.recent"
                :key="symbolIdentity(item)"
                type="button"
                role="menuitem"
                tabindex="-1"
                :title="title(item)"
                :aria-label="title(item)"
                :aria-disabled="disabled || busy"
                :style="{ fontFamily: item.fontFamily }"
                @click="insert(item)"
              >
                {{ /^\s+$/u.test(item.text) ? "␣" : item.text }}
              </button>
            </div>
            <span v-if="!preferences.recent.length" class="symbol-menu__hint">{{
              t("symbolTools.emptyRecent")
            }}</span>
          </div>
          <div class="symbol-menu__section">
            <div class="symbol-menu__label">{{ t("symbolTools.custom") }}</div>
            <div class="symbol-menu__grid">
              <button
                v-for="item in visibleCustom"
                :key="symbolIdentity(item)"
                type="button"
                role="menuitem"
                tabindex="-1"
                :title="title(item)"
                :aria-label="title(item)"
                :aria-disabled="disabled || busy"
                :style="{ fontFamily: item.fontFamily }"
                @click="insert(item)"
              >
                {{ /^\s+$/u.test(item.text) ? "␣" : item.text }}
              </button>
            </div>
          </div>
          <div v-if="fontError" role="alert" class="symbol-menu__hint">
            {{ t("symbolTools.fontFailed") }}
          </div>
          <div v-if="storageError" role="status" class="symbol-menu__hint">
            {{ t("symbolTools.storageError") }}
          </div>
        </template>
        <template #footer
          ><MenuItem @select="more"
            ><template #icon><Omega /></template>{{ t("symbolTools.more") }}</MenuItem
          ></template
        >
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.symbol-menu-tool {
  @include ribbon.tool;
}
.symbol-menu {
  z-index: var(--sheetcraft-layer-menu);
  width: min(360px, calc(100vw - 24px));
  max-height: min(480px, calc(100dvh - 120px));
}
.symbol-menu__section {
  padding: 8px 12px;
}
.symbol-menu__label,
.symbol-menu__hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--sheetcraft-text-secondary);
}
.symbol-menu__grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  margin-top: 6px;
  button {
    min-width: 0;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--sheetcraft-text-primary);
    font-size: 21px;
    line-height: 28px;
    cursor: pointer;
    &:hover {
      background: var(--sheetcraft-surface-hover);
    }
    &[aria-disabled="true"] {
      opacity: 0.5;
      cursor: default;
    }
  }
}
</style>
