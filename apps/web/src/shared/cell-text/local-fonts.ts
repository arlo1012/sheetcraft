import { computed, readonly, ref } from "vue";
import { requestSystemFontChoices, useLocalSymbolFonts } from "./local-font-source";

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

const source = useLocalSymbolFonts();
const families = computed(() => {
  const unique = new Map<string, string>();
  for (const choice of source.choices.value) {
    const family = choice.family.trim();
    if (family && !unique.has(family.toLowerCase())) unique.set(family.toLowerCase(), family);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
});
const loading = computed(() => source.queryStatus.value.state === "querying");
const status = computed(() => {
  const query = source.queryStatus.value;
  if (query.state === "error")
    return query.code === "denied" || query.code === "cancelled" ? "denied" : "failed";
  if (query.state === "ready") return families.value.length ? "loaded" : "empty";
  return "idle";
});
const availability = computed(() => {
  if (typeof window === "undefined" || !window.isSecureContext) return "insecure";
  return typeof (window as Window & { queryLocalFonts?: unknown }).queryLocalFonts === "function"
    ? "available"
    : "unsupported";
});

/** The global picker and Symbol share one metadata/handle scan; no font bytes are read here. */
export const localFontAccess = {
  families,
  loading,
  status,
  availability,
  async load(options: { refresh?: boolean } = {}): Promise<void> {
    if (availability.value !== "available") return;
    try {
      await requestSystemFontChoices(options);
    } catch {
      // Shared status contains the failure; the settings UI keeps existing choices.
    }
  },
};
