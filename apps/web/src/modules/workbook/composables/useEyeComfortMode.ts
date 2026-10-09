import { ref, watch, type Ref } from "vue";

const STORAGE_KEY = "sheetcraft.eye-comfort.enabled";

function readEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useEyeComfortMode(): Ref<boolean> {
  const enabled = ref(readEnabled());
  watch(enabled, (value) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(value));
      }
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
  });
  return enabled;
}
