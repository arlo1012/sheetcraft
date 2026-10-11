import { computed, readonly, ref } from "vue";

export type LocalFontEnvironment = {
  secure: boolean;
  query?: () => Promise<readonly { family: string }[]>;
};

export function createLocalFontAccess(getEnvironment: () => LocalFontEnvironment) {
  const families = ref<string[]>([]);
  const loading = ref(false);
  const status = ref<"idle" | "loaded" | "denied" | "failed" | "empty">("idle");
  const availability = computed(() => {
    const environment = getEnvironment();
    return !environment.secure ? "insecure" : environment.query ? "available" : "unsupported";
  });
  // Only an explicit user action invokes this API and its browser permission prompt.
  async function load(): Promise<void> {
    if (loading.value || availability.value !== "available") return;
    const { query } = getEnvironment();
    if (!query) return;
    loading.value = true;
    try {
      const fonts = await query();
      const unique = new Map<string, string>();
      for (const font of fonts) {
        const family = font.family.trim();
        if (family && !unique.has(family.toLowerCase())) unique.set(family.toLowerCase(), family);
      }
      families.value = [...unique.values()].sort((left, right) => left.localeCompare(right));
      status.value = families.value.length ? "loaded" : "empty";
    } catch (error) {
      status.value =
        error && typeof error === "object" && "name" in error && error.name === "NotAllowedError"
          ? "denied"
          : "failed";
    } finally {
      loading.value = false;
    }
  }
  return {
    families: readonly(families),
    loading: readonly(loading),
    status: readonly(status),
    availability,
    load,
  };
}

export const localFontAccess = createLocalFontAccess(() => {
  if (typeof window === "undefined") return { secure: false };
  const host = window as Window & { queryLocalFonts?: LocalFontEnvironment["query"] };
  return {
    secure: window.isSecureContext,
    query: host.queryLocalFonts ? () => host.queryLocalFonts!() : undefined,
  };
});
