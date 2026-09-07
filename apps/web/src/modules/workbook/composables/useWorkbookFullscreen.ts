import { onBeforeUnmount, onMounted, ref } from "vue";

export function useWorkbookFullscreen(onError: () => void) {
  const fullscreen = ref(false);
  const fullscreenAvailable = ref(false);
  let pending = false;

  function sync(): void {
    fullscreen.value = Boolean(document.fullscreenElement);
    fullscreenAvailable.value = Boolean(
      document.fullscreenEnabled && document.documentElement.requestFullscreen,
    );
  }

  async function toggleFullscreen(): Promise<void> {
    if (pending || !fullscreenAvailable.value) return;
    pending = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // Include body-mounted menus and dialogs in the fullscreen document.
      else await document.documentElement.requestFullscreen();
    } catch {
      onError();
    } finally {
      pending = false;
      sync();
    }
  }

  onMounted(() => {
    sync();
    document.addEventListener("fullscreenchange", sync);
  });
  onBeforeUnmount(() => document.removeEventListener("fullscreenchange", sync));

  return { fullscreen, fullscreenAvailable, toggleFullscreen };
}
