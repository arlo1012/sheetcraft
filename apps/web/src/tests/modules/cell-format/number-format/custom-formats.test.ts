import { afterEach, describe, expect, test } from "vitest";
import {
  readCustomNumberFormats,
  rememberCustomNumberFormat,
  removeCustomNumberFormat,
} from "../../../../modules/cell-format/number-format/custom-formats";

const STORAGE_KEY = "idea10.custom-number-formats";

afterEach(() => localStorage.removeItem(STORAGE_KEY));

describe("custom number-format preferences", () => {
  test("stores version 1 preferences, remembers most recent entries, and removes an entry", () => {
    rememberCustomNumberFormat("0.00;[Red]-0.00");
    rememberCustomNumberFormat("000000");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      version: 1,
      codes: ["000000", "0.00;[Red]-0.00"],
    });
    expect(readCustomNumberFormats()).toEqual(["000000", "0.00;[Red]-0.00"]);
    expect(removeCustomNumberFormat("000000")).toEqual(["0.00;[Red]-0.00"]);
    expect(readCustomNumberFormats()).toEqual(["0.00;[Red]-0.00"]);
  });

  test("rejects unsupported saved codes and incompatible stored versions", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, codes: ["0.00", "[broken"] }));
    expect(readCustomNumberFormats()).toEqual(["0.00"]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, codes: ["0.00"] }));
    expect(readCustomNumberFormats()).toEqual([]);
  });
});
