import { ref } from "vue";

// The application hosts this dialog so dismissing a font/context menu cannot unmount it.
export const fontSettingsVisible = ref(false);
