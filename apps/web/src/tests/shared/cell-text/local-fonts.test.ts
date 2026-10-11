import { describe, expect, test, vi } from "vitest";
import { createLocalFontAccess } from "../../../shared/cell-text/local-fonts";

describe("local font access", () => {
  test("queries only on explicit load and groups font styles by trimmed family", async () => {
    const query = vi.fn(async () => [
      { family: " Zeta Font ", style: "Regular" },
      { family: "Alpha Font", style: "Bold" },
      { family: "alpha font", style: "Italic" },
      { family: "", style: "Regular" },
    ]);
    const access = createLocalFontAccess(() => ({ secure: true, query }));
    expect(query).not.toHaveBeenCalled();
    expect(access.availability.value).toBe("available");
    expect(access.status.value).toBe("idle");
    await access.load();
    expect(query).toHaveBeenCalledTimes(1);
    expect(access.families.value).toEqual(["Alpha Font", "Zeta Font"]);
    expect(access.status.value).toBe("loaded");
    expect(access.loading.value).toBe(false);
  });

  test("does not query in insecure or unsupported environments", async () => {
    const query = vi.fn(async () => [{ family: "Arial" }]);
    const insecure = createLocalFontAccess(() => ({ secure: false, query }));
    const unsupported = createLocalFontAccess(() => ({ secure: true }));
    expect(insecure.availability.value).toBe("insecure");
    expect(unsupported.availability.value).toBe("unsupported");
    await insecure.load();
    await unsupported.load();
    expect(query).not.toHaveBeenCalled();
    expect(insecure.families.value).toEqual([]);
    expect(unsupported.families.value).toEqual([]);
  });

  test("reports permission denial and allows retry", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"))
      .mockResolvedValueOnce([{ family: "Arial" }]);
    const access = createLocalFontAccess(() => ({ secure: true, query }));
    await access.load();
    expect(access.status.value).toBe("denied");
    expect(access.loading.value).toBe(false);
    await access.load();
    expect(access.status.value).toBe("loaded");
    expect(access.families.value).toEqual(["Arial"]);
  });

  test("preserves loaded families when a later request fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ family: "Custom Font" }])
      .mockRejectedValueOnce(new Error("Font service failed"));
    const access = createLocalFontAccess(() => ({ secure: true, query }));
    await access.load();
    await access.load();
    expect(access.status.value).toBe("failed");
    expect(access.families.value).toEqual(["Custom Font"]);
    expect(access.loading.value).toBe(false);
  });

  test("reports an empty result after discarding blank names", async () => {
    const access = createLocalFontAccess(() => ({
      secure: true,
      query: async () => [{ family: " " }, { family: "" }],
    }));
    await access.load();
    expect(access.status.value).toBe("empty");
    expect(access.families.value).toEqual([]);
  });

  test("does not issue overlapping requests while loading", async () => {
    let finish!: (fonts: readonly { family: string }[]) => void;
    const query = vi.fn(
      () =>
        new Promise<readonly { family: string }[]>((resolve) => {
          finish = resolve;
        }),
    );
    const access = createLocalFontAccess(() => ({ secure: true, query }));
    const first = access.load();
    expect(access.loading.value).toBe(true);
    const second = access.load();
    expect(query).toHaveBeenCalledTimes(1);
    finish([{ family: "Arial" }]);
    await Promise.all([first, second]);
    expect(access.loading.value).toBe(false);
    expect(access.families.value).toEqual(["Arial"]);
  });
});
