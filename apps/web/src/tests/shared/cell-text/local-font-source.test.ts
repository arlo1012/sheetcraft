import { webcrypto, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readLocalFontNames } from "../../../shared/cell-text/local-font-names";

const storage = vi.hoisted(() => ({ read: vi.fn(), readOne: vi.fn(), save: vi.fn() }));
vi.mock("../../../shared/cell-text/local-font-store", () => ({
  readStoredLocalSymbolFonts: storage.read,
  readStoredLocalSymbolFont: storage.readOne,
  saveStoredLocalSymbolFont: storage.save,
}));

type LocalModule = typeof import("../../../shared/cell-text/local-font-source");
let module: LocalModule;
let bytes: ArrayBuffer;
let postscriptName: string;
const add = vi.fn();
const load = vi.fn();
const construct = vi.fn();
function file(data = bytes, name = "user-selected.ttf"): File {
  return { name, size: data.byteLength, arrayBuffer: async () => data.slice(0) } as File;
}
function systemChoice(postscript = postscriptName) {
  return {
    postscriptName: postscript,
    family: "Metadata family is not used for verified coverage",
    fullName: "Metadata face",
    style: "Regular",
    blob: vi.fn(async () => file()),
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.read.mockResolvedValue([]);
  storage.readOne.mockResolvedValue(undefined);
  storage.save.mockResolvedValue(undefined);
  bytes = Uint8Array.from(
    await readFile(resolve("src/shared/cell-text/fonts/NotoSansMath-Regular.ttf")),
  ).buffer;
  const names = readLocalFontNames(bytes);
  if (names.status !== "supported")
    throw new Error("Public test fixture has no verified font name");
  postscriptName = names.names.postscriptNames[0]!;
  load.mockResolvedValue(undefined);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "FontFace",
    class {
      status = "unloaded";
      constructor(family: string, data: ArrayBuffer) {
        construct(family, data);
      }
      async load() {
        await load();
        this.status = "loaded";
        return this;
      }
    },
  );
  Object.defineProperty(document, "fonts", { configurable: true, value: { add } });
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { isActive: true },
  });
  delete (window as Window & { queryLocalFonts?: unknown }).queryLocalFonts;
  module = await import("../../../shared/cell-text/local-font-source");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("explicit local Symbol font source", () => {
  test("has singleton read-only state without OS queries, bytes, storage or network at startup", () => {
    const query = vi.fn();
    Object.assign(window, { queryLocalFonts: query });
    const state = module.useLocalSymbolFonts();
    expect(module.useLocalSymbolFonts().fonts).toBe(state.fonts);
    expect(state.fonts.value).toEqual([]);
    expect(state.status.value).toEqual({ state: "idle" });
    expect(query).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  test("explicit metadata query never calls any font Blob and selection loads exactly one", async () => {
    const selected = systemChoice();
    const other = systemChoice("AnotherFont");
    const query = vi.fn(async () => [selected, other]);
    Object.assign(window, { queryLocalFonts: query });
    const choices = await module.requestSystemFontChoices();
    expect(choices).toHaveLength(2);
    expect(selected.blob).not.toHaveBeenCalled();
    expect(other.blob).not.toHaveBeenCalled();
    const font = await module.loadSystemFont(choices[0]!.id);
    expect(selected.blob).toHaveBeenCalledOnce();
    expect(other.blob).not.toHaveBeenCalled();
    expect(font).toMatchObject({
      displayFamily: "Noto Sans Math",
      source: "system",
      persisted: false,
      count: 3033,
    });
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("rejects missing user gesture before asking for system fonts", async () => {
    const query = vi.fn();
    Object.assign(window, { queryLocalFonts: query });
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    await expect(module.requestSystemFontChoices()).rejects.toMatchObject({
      code: "gesture-required",
    });
    expect(query).not.toHaveBeenCalled();
  });

  test("settings and Symbol share one metadata scan, no bytes, and cached reads need no gesture", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const entry = systemChoice();
    const query = vi.fn(async () => [entry]);
    Object.assign(window, { queryLocalFonts: query });
    const { localFontAccess } = await import("../../../shared/cell-text/local-fonts");
    expect(localFontAccess.families.value).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    await localFontAccess.load();
    expect(localFontAccess.families.value).toEqual([entry.family]);
    expect(localFontAccess.status.value).toBe("loaded");
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    expect(await module.requestSystemFontChoices()).toHaveLength(1);
    await localFontAccess.load();
    expect(query).toHaveBeenCalledOnce();
    expect(entry.blob).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });

  test("one shared Settings scan supplies Symbol handles and only the explicitly selected Blob", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const selected = systemChoice();
    const other = systemChoice("OtherMetadataFace");
    const query = vi.fn(async () => [selected, other]);
    Object.assign(window, { queryLocalFonts: query });
    const symbolState = module.useLocalSymbolFonts();
    const { localFontAccess } = await import("../../../shared/cell-text/local-fonts");
    expect(query).not.toHaveBeenCalled();
    expect(symbolState.choices.value).toEqual([]);
    await localFontAccess.load({ refresh: true });
    expect(query).toHaveBeenCalledOnce();
    expect(symbolState.choices.value).toHaveLength(2);
    expect(selected.blob).not.toHaveBeenCalled();
    expect(other.blob).not.toHaveBeenCalled();
    const verified = await module.loadSystemFont(symbolState.choices.value[0]!.id, {
      persist: false,
    });
    expect(query).toHaveBeenCalledOnce();
    expect(selected.blob).toHaveBeenCalledOnce();
    expect(other.blob).not.toHaveBeenCalled();
    expect(verified).toMatchObject({
      displayFamily: "Noto Sans Math",
      count: 3033,
      source: "system",
      persisted: false,
    });
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("coalesces concurrent metadata requests and caches a successful empty result", async () => {
    let finish!: (result: ReturnType<typeof systemChoice>[]) => void;
    const query = vi.fn(
      () =>
        new Promise<ReturnType<typeof systemChoice>[]>((resolve) => {
          finish = resolve;
        }),
    );
    Object.assign(window, { queryLocalFonts: query });
    const first = module.requestSystemFontChoices();
    const second = module.requestSystemFontChoices({ refresh: true });
    expect(second).toBe(first);
    expect(query).toHaveBeenCalledOnce();
    expect(module.useLocalSymbolFonts().queryStatus.value).toEqual({ state: "querying" });
    finish([]);
    expect(await first).toEqual([]);
    expect(await module.requestSystemFontChoices()).toEqual([]);
    expect(query).toHaveBeenCalledOnce();
    expect(module.useLocalSymbolFonts().queryStatus.value).toEqual({ state: "ready" });
  });

  test.each(["NotAllowedError", "AbortError", "Error"])(
    "failed %s refresh preserves prior metadata and usable handles until explicit retry",
    async (name) => {
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
      const old = systemChoice();
      const replacement = systemChoice("AnotherFont");
      const query = vi
        .fn()
        .mockResolvedValueOnce([old])
        .mockRejectedValueOnce(new DOMException("Refresh failed", name))
        .mockResolvedValueOnce([replacement]);
      Object.assign(window, { queryLocalFonts: query });
      const previous = await module.requestSystemFontChoices();
      await expect(module.requestSystemFontChoices({ refresh: true })).rejects.toMatchObject({
        code:
          name === "NotAllowedError"
            ? "denied"
            : name === "AbortError"
              ? "cancelled"
              : "query-failed",
      });
      const { localFontAccess } = await import("../../../shared/cell-text/local-fonts");
      expect(localFontAccess.status.value).toBe(name === "Error" ? "failed" : "denied");
      expect(module.useLocalSymbolFonts().choices.value).toEqual(previous);
      expect(await module.requestSystemFontChoices()).toEqual(previous);
      expect(query).toHaveBeenCalledTimes(2);
      await module.loadSystemFont(previous[0]!.id);
      expect(old.blob).toHaveBeenCalledOnce();
      expect(replacement.blob).not.toHaveBeenCalled();
      expect(await module.requestSystemFontChoices({ refresh: true })).toEqual([
        expect.objectContaining({ id: "system:AnotherFont" }),
      ]);
      expect(query).toHaveBeenCalledTimes(3);
      await expect(module.loadSystemFont(previous[0]!.id)).rejects.toMatchObject({
        code: "invalid-choice",
      });
    },
  );

  test("successful empty refresh replaces old metadata and handles together", async () => {
    const entry = systemChoice();
    const query = vi.fn().mockResolvedValueOnce([entry]).mockResolvedValueOnce([]);
    Object.assign(window, { queryLocalFonts: query });
    const previous = await module.requestSystemFontChoices();
    expect(await module.requestSystemFontChoices({ refresh: true })).toEqual([]);
    expect(module.useLocalSymbolFonts().choices.value).toEqual([]);
    await expect(module.loadSystemFont(previous[0]!.id)).rejects.toMatchObject({
      code: "invalid-choice",
    });
    expect(entry.blob).not.toHaveBeenCalled();
  });

  test("unsupported API, denied permission and cancellation have stable separate codes", async () => {
    await expect(module.requestSystemFontChoices()).rejects.toMatchObject({ code: "unsupported" });
    Object.assign(window, {
      queryLocalFonts: vi.fn().mockRejectedValue(new DOMException("No", "NotAllowedError")),
    });
    await expect(module.requestSystemFontChoices()).rejects.toMatchObject({ code: "denied" });
    Object.assign(window, {
      queryLocalFonts: vi.fn().mockRejectedValue(new DOMException("No", "AbortError")),
    });
    await expect(module.requestSystemFontChoices()).rejects.toMatchObject({ code: "cancelled" });
    expect(module.useLocalSymbolFonts().status.value).toEqual({
      state: "error",
      code: "cancelled",
    });
    await expect(module.loadSystemFont("unqueried-font")).rejects.toMatchObject({
      code: "invalid-choice",
    });
  });

  test("file import uses actual family/cmap/hash and unique content-addressed alias", async () => {
    const font = await module.importLocalSymbolFont(file(bytes, "FakeFamilyName.otf"));
    const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
    expect(font.id).toBe(digest);
    expect(font.family).toBe(`SheetcraftLocal_${digest}`);
    expect(font.displayFamily).toBe("Noto Sans Math");
    expect(font.ranges.some(([start, end]) => start <= 0x2192 && end >= 0x2192)).toBe(true);
    expect(construct).toHaveBeenCalledWith(font.family, expect.any(ArrayBuffer));
    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(storage.save).not.toHaveBeenCalled();
    expect(module.findLocalSymbolFont(font.family)).toBe(font);
    expect(module.findLocalSymbolFont("Noto Sans Math")).toBe(font);
    expect(await module.ensureLocalSymbolFont(font.family)).toBe(font);
  });

  test("same name with different bytes keeps separate aliases and makes original-family lookup ambiguous", async () => {
    const first = await module.importLocalSymbolFont(file());
    const different = bytes.slice(0);
    new DataView(different).setUint32(16, new DataView(different).getUint32(16) ^ 1);
    const second = await module.importLocalSymbolFont(file(different));
    expect(second.displayFamily).toBe(first.displayFamily);
    expect(second.family).not.toBe(first.family);
    expect(module.findLocalSymbolFont(first.displayFamily)).toBeUndefined();
    expect(module.findLocalSymbolFont(first.family)).toBe(first);
  });

  test("identical imports deduplicate the loaded face and explicit persistence is opt-in", async () => {
    const first = await module.importLocalSymbolFont(file());
    const second = await module.importLocalSymbolFont(file());
    expect(second).toBe(first);
    expect(add).toHaveBeenCalledOnce();
    const saved = await module.importLocalSymbolFont(file(), { persist: true });
    expect(saved.persisted).toBe(true);
    expect(storage.save).toHaveBeenCalledWith({
      version: 1,
      id: first.id,
      bytes: expect.any(ArrayBuffer),
      source: "file",
    });
    expect(add).toHaveBeenCalledOnce();
  });

  test("concurrent duplicate imports await a single real font load before registering", async () => {
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    load.mockReturnValue(waiting);
    const first = module.importLocalSymbolFont(file());
    const second = module.importLocalSymbolFont(file());
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(add).not.toHaveBeenCalled();
    release();
    const [one, two] = await Promise.all([first, second]);
    expect(two).toBe(one);
    expect(add).toHaveBeenCalledOnce();
    expect(module.useLocalSymbolFonts().fonts.value).toHaveLength(1);
  });

  test("does not register any FontFace before its actual load succeeds", async () => {
    load.mockRejectedValue(new DOMException("Bad font", "SyntaxError"));
    await expect(module.importLocalSymbolFont(file(), { persist: true })).rejects.toMatchObject({
      code: "font-load",
    });
    expect(module.useLocalSymbolFonts().fonts.value).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("parser, filesize and secure-hash failures are separated from font loading", async () => {
    const arrayBuffer = vi.fn();
    await expect(
      module.importLocalSymbolFont({ size: 64 * 1024 * 1024 + 1, arrayBuffer } as unknown as File),
    ).rejects.toMatchObject({ code: "size" });
    expect(arrayBuffer).not.toHaveBeenCalled();
    const unsupported = bytes.slice(0);
    new DataView(unsupported).setUint32(0, 0x774f4632);
    await expect(module.importLocalSymbolFont(file(unsupported))).rejects.toMatchObject({
      code: "container",
    });
    await expect(module.importLocalSymbolFont(file(bytes.slice(0, 100)))).rejects.toMatchObject({
      code: "malformed",
    });
    vi.stubGlobal("crypto", undefined);
    await expect(module.importLocalSymbolFont(file())).rejects.toMatchObject({
      code: "hash-unavailable",
    });
    expect(add).not.toHaveBeenCalled();
  });

  test("invalid or unsupported cmap is rejected before claiming glyph coverage", async () => {
    const invalid = bytes.slice(0);
    const view = new DataView(invalid);
    for (let index = 0; index < view.getUint16(4); index++) {
      const position = 12 + index * 16;
      if (view.getUint32(position) === 0x636d6170) view.setUint32(position, 0x74657374);
    }
    await expect(module.importLocalSymbolFont(file(invalid))).rejects.toMatchObject({
      code: "cmap",
    });
    expect(construct).not.toHaveBeenCalled();
    expect(module.useLocalSymbolFonts().fonts.value).toEqual([]);
  });

  test("system metadata cannot substitute a mismatching actual PostScript identity", async () => {
    const entry = systemChoice("MetadataThatDoesNotMatchBytes");
    Object.assign(window, { queryLocalFonts: async () => [entry] });
    const choices = await module.requestSystemFontChoices();
    await expect(module.loadSystemFont(choices[0]!.id)).rejects.toMatchObject({ code: "name" });
    expect(add).not.toHaveBeenCalled();
  });

  test("explicit persistent save failures do not falsely register or mark a font saved", async () => {
    storage.save.mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await expect(module.importLocalSymbolFont(file(), { persist: true })).rejects.toMatchObject({
      code: "storage-quota",
    });
    expect(add).not.toHaveBeenCalled();
    expect(module.useLocalSymbolFonts().fonts.value).toEqual([]);
    const memoryOnly = await module.importLocalSymbolFont(file());
    expect(memoryOnly.persisted).toBe(false);
  });

  test("lazy restore revalidates remembered bytes/hash with no OS query or storage rewrite", async () => {
    const id = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
    storage.read.mockResolvedValue([{ version: 1, id, bytes, source: "file" }]);
    const query = vi.fn();
    Object.assign(window, { queryLocalFonts: query });
    expect(storage.read).not.toHaveBeenCalled();
    const restored = await module.restoreStoredLocalSymbolFonts();
    expect(restored[0]).toMatchObject({ id, family: `SheetcraftLocal_${id}`, persisted: true });
    expect(query).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("unknown family never discovers OS fonts; exact missing saved alias returns unavailable", async () => {
    expect(await module.ensureLocalSymbolFont("Arial")).toBeUndefined();
    expect(storage.readOne).not.toHaveBeenCalled();
    const alias = `SheetcraftLocal_${"a".repeat(64)}`;
    expect(await module.ensureLocalSymbolFont(alias)).toBeUndefined();
    expect(storage.readOne).toHaveBeenCalledWith("a".repeat(64));
  });

  test("print source reads only an exact loaded alias and re-verifies a fresh chosen-file copy", async () => {
    const chosen = file();
    const read = vi.spyOn(chosen, "arrayBuffer");
    const query = vi.fn();
    Object.assign(window, { queryLocalFonts: query });
    const font = await module.importLocalSymbolFont(chosen);
    const originalFace = add.mock.calls[0]![0];
    const source = await module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength);
    expect(source).toMatchObject({ id: font.id, family: font.family, face: originalFace });
    expect(source?.bytes).toEqual(bytes);
    expect(source?.bytes).not.toBe(bytes);
    expect(read).toHaveBeenCalledTimes(2);
    expect(
      await module.readLoadedLocalSymbolFontSource(font.displayFamily, bytes.byteLength),
    ).toBeUndefined();
    expect(await module.readLoadedLocalSymbolFontSource("Arial", bytes.byteLength)).toBeUndefined();
    expect(
      await module.readLoadedLocalSymbolFontSource(
        `SheetcraftLocal_${"a".repeat(64)}`,
        bytes.byteLength,
      ),
    ).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    expect(storage.readOne).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("print source rejects the remaining-byte cap before reading a chosen Blob", async () => {
    const chosen = file();
    const read = vi.spyOn(chosen, "arrayBuffer");
    const font = await module.importLocalSymbolFont(chosen);
    read.mockClear();
    await expect(
      module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength - 1),
    ).rejects.toMatchObject({ code: "size" });
    expect(read).not.toHaveBeenCalled();
  });

  test("print source retains only the explicitly selected system Blob, never queries or invokes other handles", async () => {
    const chosen = file();
    const selected = systemChoice();
    selected.blob.mockResolvedValue(chosen);
    const other = systemChoice("OtherFont");
    const query = vi.fn(async () => [selected, other]);
    Object.assign(window, { queryLocalFonts: query });
    const choices = await module.requestSystemFontChoices();
    const font = await module.loadSystemFont(choices[0]!.id);
    expect(
      await module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength),
    ).toMatchObject({ id: font.id });
    expect(query).toHaveBeenCalledOnce();
    expect(selected.blob).toHaveBeenCalledOnce();
    expect(other.blob).not.toHaveBeenCalled();
  });

  test("print source rereads only a restored exact persisted id, respects metadata cap, and refuses changed bytes", async () => {
    const id = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
    const record = { version: 1, id, bytes, source: "file" };
    storage.read.mockResolvedValue([record]);
    const [font] = await module.restoreStoredLocalSymbolFonts();
    if (!font) throw new Error("Expected restored fixture");
    await expect(
      module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength - 1),
    ).rejects.toMatchObject({ code: "size" });
    expect(storage.readOne).not.toHaveBeenCalled();
    storage.readOne.mockResolvedValue(record);
    const source = await module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength);
    expect(source?.bytes).toEqual(bytes);
    expect(source?.bytes).not.toBe(bytes);
    expect(storage.readOne).toHaveBeenCalledWith(id);
    const changed = bytes.slice(0);
    new Uint8Array(changed)[16] = new Uint8Array(changed)[16]! ^ 1;
    storage.readOne.mockResolvedValue({ ...record, bytes: changed });
    await expect(
      module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength),
    ).rejects.toMatchObject({ code: "storage-corrupt" });
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("print source rejects changed selected-file bytes and an unloaded original face", async () => {
    const chosen = file();
    const font = await module.importLocalSymbolFont(chosen);
    const changed = bytes.slice(0);
    new Uint8Array(changed)[16] = new Uint8Array(changed)[16]! ^ 1;
    vi.spyOn(chosen, "arrayBuffer").mockResolvedValue(changed);
    await expect(
      module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength),
    ).rejects.toMatchObject({ code: "storage-corrupt" });
    add.mock.calls[0]![0].status = "error";
    expect(
      await module.readLoadedLocalSymbolFontSource(font.family, bytes.byteLength),
    ).toBeUndefined();
  });

  test("saved bytes with changed hash are rejected without adding a false alias", async () => {
    storage.readOne.mockResolvedValue({ version: 1, id: "a".repeat(64), bytes, source: "file" });
    await expect(
      module.ensureLocalSymbolFont(`SheetcraftLocal_${"a".repeat(64)}`),
    ).rejects.toMatchObject({ code: "storage-corrupt" });
    expect(add).not.toHaveBeenCalled();
  });
});
