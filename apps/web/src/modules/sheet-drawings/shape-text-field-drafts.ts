import { inject, onBeforeUnmount, watch, type InjectionKey } from "vue";

export type ShapeFieldFlushResult = { accepted: true } | { accepted: false };
type RegisteredField = {
  owner: string;
  current: () => boolean;
  flush: () => boolean;
  focus: () => void;
  blocking?: () => boolean;
  containsTarget?: (target: EventTarget | null) => boolean;
};
export function createShapeTextFieldDrafts() {
  const fields = new Map<symbol, RegisteredField>();
  let flushing = false;
  let rejected: { key: symbol; field: RegisteredField } | undefined;
  return {
    register(field: RegisteredField) {
      const key = Symbol("shape-text-field");
      fields.set(key, field);
      return () => fields.delete(key);
    },
    ownsTarget(owner: string, target: EventTarget | null): boolean {
      for (const [key, field] of fields) {
        if (field.owner !== owner || !field.containsTarget) continue;
        try {
          if (field.current() && field.containsTarget(target) && fields.has(key) && field.current())
            return true;
        } catch {
          /* Retired or detached controls cannot own replacement navigation. */
        }
      }
      return false;
    },
    flush(owner: string): ShapeFieldFlushResult {
      if (flushing) return { accepted: false };
      flushing = true;
      rejected = undefined;
      try {
        // A field may unregister/re-register synchronously during accepted formatting.
        const captured = [...fields];
        for (const [key, field] of captured) {
          if (field.owner !== owner || !fields.has(key)) continue;
          let accepted = false;
          try {
            accepted = field.current() && field.flush() && fields.has(key) && field.current();
          } catch {
            /* Retain this field's private invalid draft. */
          }
          if (!accepted) {
            rejected = { key, field };
            try {
              if (fields.has(key) && field.current()) field.focus();
            } catch {
              /* A detached field cannot steal replacement focus. */
            }
            return { accepted: false };
          }
        }
        return { accepted: true };
      } finally {
        flushing = false;
      }
    },
    focusRejected(owner: string): boolean {
      const entry = rejected;
      if (!entry || entry.field.owner !== owner || !fields.has(entry.key)) return false;
      try {
        if (!entry.field.current() || entry.field.blocking?.() === false) return false;
        entry.field.focus();
        return true;
      } catch {
        return false;
      }
    },
  };
}
export const shapeTextFieldDraftsKey: InjectionKey<ReturnType<typeof createShapeTextFieldDrafts>> =
  Symbol("shape-text-field-drafts");

/** An exact session token is retired immediately on replacement or unmount. */
export function useShapeTextFieldDraft(options: {
  owner: () => string | undefined;
  flush: () => boolean;
  focus: () => void;
  blocking?: () => boolean;
  containsTarget?: (target: EventTarget | null) => boolean;
}) {
  const registry = inject(shapeTextFieldDraftsKey, undefined);
  let unregister: (() => void) | undefined;
  watch(
    options.owner,
    (owner) => {
      unregister?.();
      unregister = owner
        ? registry?.register({
            owner,
            current: () => options.owner() === owner,
            flush: options.flush,
            focus: options.focus,
            blocking: options.blocking,
            containsTarget: options.containsTarget,
          })
        : undefined;
    },
    { immediate: true, flush: "sync" },
  );
  onBeforeUnmount(() => unregister?.());
}
