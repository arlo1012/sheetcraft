import { afterEach, describe, expect, test } from "vitest";
import {
  RECENT_COLORS_STORAGE_KEY,
  readRecentColors,
  recordRecentColor,
} from "../../../../shared/color/palette";

afterEach(() => localStorage.clear());

describe("recent colors", () => {
  test("filters corrupt recent storage, deduplicates, and keeps the latest ten colors", () => {
    localStorage.setItem(
      RECENT_COLORS_STORAGE_KEY,
      JSON.stringify(["#ABCDEF", "bad", "#abcdef", 2, "#123456"]),
    );
    expect(readRecentColors()).toEqual(["#abcdef", "#123456"]);
    expect(recordRecentColor("#fedcba")).toEqual(["#fedcba", "#abcdef", "#123456"]);
    for (let color = 0; color < 12; color += 1) {
      recordRecentColor(`#${color.toString(16).padStart(6, "0")}`);
    }
    expect(readRecentColors()).toHaveLength(10);
    expect(readRecentColors()[0]).toBe("#00000b");
    expect(readRecentColors()).not.toContain("#000001");
  });

  test("retains recent selections when storage reads work but writes fail", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    } as unknown as Storage;
    expect(recordRecentColor("#123456", storage)).toEqual(["#123456"]);
    expect(readRecentColors(storage)).toEqual(["#123456"]);
    expect(recordRecentColor("#abcdef", storage)).toEqual(["#abcdef", "#123456"]);
  });
});
