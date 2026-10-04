import { afterEach, describe, expect, test } from "vitest";
import {
  PAGE_MARGIN_HISTORY_STORAGE_KEY,
  readPageMarginHistory,
  recordPageMarginHistory,
} from "../../../modules/page-layout/page-margin-history";

afterEach(() => localStorage.removeItem(PAGE_MARGIN_HISTORY_STORAGE_KEY));

const margins = {
  top: 34.66,
  bottom: 7.14,
  left: 19.05,
  right: 6.09,
  header: 12.7,
  footer: 5.08,
};

describe("page margin history", () => {
  test("persists a custom margin snapshot without retaining its input object", () => {
    const source = { ...margins };
    const saved = recordPageMarginHistory(source);
    source.top = 99;

    expect(saved.top).toBe(34.66);
    expect(readPageMarginHistory()).toEqual({
      top: 34.66,
      bottom: 7.14,
      left: 19.05,
      right: 6.09,
      header: 12.7,
      footer: 5.08,
    });
  });

  test("rejects stale and invalid browser snapshots", () => {
    const snapshots = [
      { version: 2, margins },
      { version: 1, margins: { ...margins, top: -1 } },
      { version: 1, margins: { ...margins, left: Number.POSITIVE_INFINITY } },
      { version: 1, margins: { ...margins, header: 35 } },
      { version: 1, margins: { ...margins, footer: 8 } },
      { version: 1, margins: { ...margins, right: 5000.1 } },
    ];

    for (const snapshot of snapshots) {
      localStorage.setItem(PAGE_MARGIN_HISTORY_STORAGE_KEY, JSON.stringify(snapshot));
      expect(readPageMarginHistory()).toBeUndefined();
    }
  });
});
