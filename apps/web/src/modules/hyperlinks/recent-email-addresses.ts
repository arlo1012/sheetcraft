const storageKey = "sheetcraft.hyperlinks.recent-emails";
const limit = 20;

export function loadRecentEmailAddresses(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored)
      ? stored
          .filter((email): email is string => typeof email === "string" && !!email)
          .slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

export function rememberEmailAddress(recent: readonly string[], email: string): string[] {
  const next = [email, ...recent.filter((entry) => entry !== email)].slice(0, limit);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Keep the session list usable when the browser cannot save preferences.
  }
  return next;
}
