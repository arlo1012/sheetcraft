<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { ShapeClipboardTransferConfirmation } from "../useShapeClipboard";
const props = defineProps<{ request: ShapeClipboardTransferConfirmation }>();
const { t } = useAppI18n();
// Capture this exact dialog instance, not callbacks from a later request.
const confirm = props.request.confirm;
const cancel = props.request.cancel;
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('drawing.crossSheetCutTitle')"
    width="500px"
    :style="{ maxWidth: 'calc(100vw - 32px)' }"
    :close-on-overlay-click="false"
    :confirm-btn="t('drawing.crossSheetCutConfirm')"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="cancel"
  >
    <div data-shape-transfer-confirmation>
      <p>
        {{
          t("drawing.crossSheetCutMessage", {
            source: request.sourceSheetName,
            target: request.targetSheetName,
            count: request.disconnectedEndpoints.total,
          })
        }}
      </p>
      <p>
        {{
          t("drawing.crossSheetCutDetails", {
            moved: request.disconnectedEndpoints.moved,
            remaining: request.disconnectedEndpoints.remaining,
          })
        }}
      </p>
      <p>{{ t("drawing.crossSheetCutHint") }}</p>
    </div>
  </Dialog>
</template>
