import { readonly, shallowRef } from "vue";
import { readFontCharacterCoverage, type FontCoverageRange } from "./font-character-coverage";
import { readLocalFontNames } from "./local-font-names";
import {
  LOCAL_FONT_MAX_BYTES,
  LocalSymbolFontError,
  localFontFailure,
  type LocalSymbolFontErrorCode,
} from "./local-font-errors";
import {
  readStoredLocalSymbolFont,
  readStoredLocalSymbolFonts,
  saveStoredLocalSymbolFont,
  type StoredLocalSymbolFont,
} from "./local-font-store";

export { LocalSymbolFontError, type LocalSymbolFontErrorCode } from "./local-font-errors";
export type LocalSymbolFont = Readonly<{
  id: string;
  displayFamily: string;
  /** Content-addressed CSS family; never aliases an unrelated same-name font. */
  family: string;
  ranges: readonly FontCoverageRange[];
  count: number;
  source: "system" | "file";
  persisted: boolean;
}>;
export type SystemSymbolFontChoice = Readonly<{
  id: string;
  postscriptName: string;
  family: string;
  fullName: string;
  style: string;
}>;
export type LocalSymbolFontStatus = Readonly<{
  state: "idle" | "querying" | "loading" | "restoring" | "error";
  code?: LocalSymbolFontErrorCode;
}>;
export type LocalSymbolFontOptions = Readonly<{ persist?: boolean }>;
export type SystemFontQueryStatus = Readonly<{
  state: "idle" | "querying" | "ready" | "error";
  code?: LocalSymbolFontErrorCode;
}>;
export type SystemFontQueryOptions = Readonly<{ refresh?: boolean }>;
type SystemFontData = Omit<SystemSymbolFontChoice, "id"> & { blob: () => Promise<Blob> };
type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<readonly SystemFontData[]> };

const fonts = shallowRef<readonly LocalSymbolFont[]>([]);
const choices = shallowRef<readonly SystemSymbolFontChoice[]>([]);
const status = shallowRef<LocalSymbolFontStatus>({ state: "idle" });
const queryStatus = shallowRef<SystemFontQueryStatus>({ state: "idle" });
const handles = new Map<string, SystemFontData>();
const pending = new Map<string, Promise<LocalSymbolFont>>();
// Keep the explicitly selected immutable Blob, not another retained byte buffer.
// Restored resources retain only their exact persisted identity and byte length.
const loadedSources = new Map<
  string,
  Readonly<{ face: FontFace; blob?: Blob; byteLength: number }>
>();
let operationVersion = 0;
let queryVersion = 0;
let queryPromise: Promise<readonly SystemSymbolFontChoice[]> | undefined;
let queriedSystemFonts = false;
let restorePromise: Promise<readonly LocalSymbolFont[]> | undefined;

/** No permission, filesystem, or storage access occurs while obtaining these refs. */
export function useLocalSymbolFonts() {
  return {
    fonts: readonly(fonts),
    choices: readonly(choices),
    status: readonly(status),
    queryStatus: readonly(queryStatus),
  };
}

function run<T>(
  state: "querying" | "loading" | "restoring",
  task: () => Promise<T>,
  fallback: LocalSymbolFontErrorCode,
): Promise<T> {
  const version = ++operationVersion;
  status.value = { state };
  let promise: Promise<T>;
  try {
    // Invoke synchronously so queryLocalFonts retains the explicit button gesture.
    promise = task();
  } catch (error) {
    promise = Promise.reject(error);
  }
  return promise.then(
    (result) => {
      if (version === operationVersion) status.value = { state: "idle" };
      return result;
    },
    (error: unknown) => {
      const failure = localFontFailure(error, fallback);
      if (version === operationVersion) status.value = { state: "error", code: failure.code };
      throw failure;
    },
  );
}

function validMetadata(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    [...value].every((character) => {
      const point = character.codePointAt(0)!;
      return (
        point >= 32 && !(point >= 127 && point <= 159) && !(point >= 0xd800 && point <= 0xdfff)
      );
    })
  );
}

/** Explicit user gesture only. Retain metadata/handles, never read every font's bytes.
 * https://wicg.github.io/local-font-access/
 */
export function requestSystemFontChoices(
  options: SystemFontQueryOptions = {},
): Promise<readonly SystemSymbolFontChoice[]> {
  if (queryPromise) return queryPromise;
  if (queriedSystemFonts && !options.refresh) return Promise.resolve(choices.value);
  queryStatus.value = { state: "querying" };
  const request = run(
    "querying",
    async () => {
      if (
        typeof window === "undefined" ||
        typeof (window as LocalFontWindow).queryLocalFonts !== "function"
      )
        throw new LocalSymbolFontError("unsupported");
      if (navigator.userActivation && !navigator.userActivation.isActive)
        throw new LocalSymbolFontError("gesture-required");
      const version = ++queryVersion;
      const result = await (window as LocalFontWindow).queryLocalFonts!();
      const available: SystemSymbolFontChoice[] = [];
      const nextHandles = new Map<string, SystemFontData>();
      for (const entry of result) {
        if (
          !validMetadata(entry.postscriptName) ||
          !validMetadata(entry.family) ||
          !validMetadata(entry.fullName) ||
          !validMetadata(entry.style) ||
          typeof entry.blob !== "function"
        )
          continue;
        const id = `system:${entry.postscriptName}`;
        if (nextHandles.has(id)) continue;
        available.push(
          Object.freeze({
            id,
            postscriptName: entry.postscriptName,
            family: entry.family,
            fullName: entry.fullName,
            style: entry.style,
          }),
        );
        nextHandles.set(id, entry);
      }
      if (version === queryVersion) {
        handles.clear();
        for (const [id, entry] of nextHandles) handles.set(id, entry);
        choices.value = Object.freeze(available);
      }
      return available;
    },
    "query-failed",
  );
  queryPromise = request
    .then(
      (result) => {
        queriedSystemFonts = true;
        queryStatus.value = { state: "ready" };
        return result;
      },
      (error: unknown) => {
        const failure = localFontFailure(error, "query-failed");
        queryStatus.value = { state: "error", code: failure.code };
        throw failure;
      },
    )
    .finally(() => {
      queryPromise = undefined;
    });
  return queryPromise;
}

/** Alias lookup is exact; a real family is resolved only when its loaded identity is unique. */
export function findLocalSymbolFont(family: string): LocalSymbolFont | undefined {
  const exact = fonts.value.find((font) => font.family === family);
  if (exact) return exact;
  const matching = fonts.value.filter((font) => font.displayFamily === family);
  return matching.length === 1 ? matching[0] : undefined;
}

async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new LocalSymbolFontError("hash-unavailable");
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new LocalSymbolFontError("hash-unavailable");
  }
}

async function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > LOCAL_FONT_MAX_BYTES)
    throw new LocalSymbolFontError("size");
  try {
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength !== blob.size) throw new LocalSymbolFontError("file-read");
    return bytes;
  } catch (error) {
    throw localFontFailure(error, "file-read");
  }
}

async function register(
  bytes: ArrayBuffer,
  source: "system" | "file",
  options: LocalSymbolFontOptions,
  expected?: Readonly<{ id?: string; postscriptName?: string }>,
  sourceBlob?: Blob,
): Promise<LocalSymbolFont> {
  if (bytes.byteLength <= 0 || bytes.byteLength > LOCAL_FONT_MAX_BYTES)
    throw new LocalSymbolFontError("size");
  const name = readLocalFontNames(bytes);
  if (name.status !== "supported") throw new LocalSymbolFontError(name.reason);
  const coverage = readFontCharacterCoverage(bytes);
  if (coverage.status !== "supported")
    throw new LocalSymbolFontError(coverage.reason === "format" ? "cmap" : coverage.reason);
  if (!coverage.count) throw new LocalSymbolFontError("cmap");
  if (expected?.postscriptName && !name.names.postscriptNames.includes(expected.postscriptName))
    throw new LocalSymbolFontError("name");
  const id = await fingerprint(bytes);
  if (expected?.id && expected.id !== id) throw new LocalSymbolFontError("storage-corrupt");
  const earlier = pending.get(id);
  if (earlier) await earlier;
  const existing = fonts.value.find((font) => font.id === id);
  if (existing) {
    if (options.persist && !existing.persisted) {
      await saveStoredLocalSymbolFont({ version: 1, id, source: existing.source, bytes });
      const persisted = Object.freeze({ ...existing, persisted: true });
      fonts.value = Object.freeze(fonts.value.map((font) => (font.id === id ? persisted : font)));
      return persisted;
    }
    return existing;
  }
  const loading = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts)
      throw new LocalSymbolFontError("font-load");
    const family = `SheetcraftLocal_${id}`;
    let face: FontFace;
    try {
      face = new FontFace(family, bytes, { display: "swap" });
      await face.load();
      if (face.status !== "loaded") throw new LocalSymbolFontError("font-load");
    } catch {
      throw new LocalSymbolFontError("font-load");
    }
    if (options.persist) await saveStoredLocalSymbolFont({ version: 1, id, source, bytes });
    try {
      document.fonts.add(face);
    } catch {
      throw new LocalSymbolFontError("font-load");
    }
    const font: LocalSymbolFont = Object.freeze({
      id,
      family,
      displayFamily: name.names.family,
      ranges: Object.freeze(
        coverage.ranges.map((range) => Object.freeze([...range]) as FontCoverageRange),
      ),
      count: coverage.count,
      source,
      persisted: options.persist === true,
    });
    loadedSources.set(
      family,
      Object.freeze({ face, blob: sourceBlob, byteLength: bytes.byteLength }),
    );
    fonts.value = Object.freeze([...fonts.value, font]);
    return font;
  })();
  pending.set(id, loading);
  try {
    return await loading;
  } finally {
    pending.delete(id);
  }
}

export function loadSystemFont(
  choiceId: string,
  options: LocalSymbolFontOptions = {},
): Promise<LocalSymbolFont> {
  return run(
    "loading",
    async () => {
      const selected = handles.get(choiceId);
      if (!selected) throw new LocalSymbolFontError("invalid-choice");
      const blob = await selected.blob();
      const bytes = await readBytes(blob);
      return register(bytes, "system", options, { postscriptName: selected.postscriptName }, blob);
    },
    "file-read",
  );
}

/** The chosen TTF/OTF Blob remains available; device storage requires explicit opt-in. */
export function importLocalSymbolFont(
  file: File,
  options: LocalSymbolFontOptions = {},
): Promise<LocalSymbolFont> {
  return run(
    "loading",
    async () => register(await readBytes(file), "file", options, undefined, file),
    "file-read",
  );
}

export type LoadedLocalSymbolFontSource = Readonly<{
  id: string;
  family: string;
  face: FontFace;
  /** Caller-owned copy, verified again against the loaded content-addressed identity. */
  bytes: ArrayBuffer;
}>;

/**
 * Exact already-loaded aliases only. Never scans OS fonts, requests permission,
 * loads a new face, or writes storage. The cap is checked before reading a Blob
 * or the one explicitly persisted resource; no print byte buffers are cached.
 */
export async function readLoadedLocalSymbolFontSource(
  family: string,
  maxBytes: number,
): Promise<LoadedLocalSymbolFontSource | undefined> {
  const font = fonts.value.find((entry) => entry.family === family);
  const source = loadedSources.get(family);
  if (!font || !source || source.face.status !== "loaded") return undefined;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    source.byteLength > Math.min(maxBytes, LOCAL_FONT_MAX_BYTES)
  )
    throw new LocalSymbolFontError("size");
  let bytes: ArrayBuffer;
  if (source.blob) bytes = await readBytes(source.blob);
  else {
    if (!font.persisted) return undefined;
    const record = await readStoredLocalSymbolFont(font.id);
    if (!record || record.id !== font.id || record.source !== font.source)
      throw new LocalSymbolFontError("storage-corrupt");
    bytes = record.bytes;
  }
  if (bytes.byteLength !== source.byteLength || bytes.byteLength > maxBytes)
    throw new LocalSymbolFontError("storage-corrupt");
  if ((await fingerprint(bytes)) !== font.id) throw new LocalSymbolFontError("storage-corrupt");
  if (loadedSources.get(family) !== source || source.face.status !== "loaded")
    throw new LocalSymbolFontError("font-load");
  return Object.freeze({ id: font.id, family, face: source.face, bytes: bytes.slice(0) });
}

async function restore(record: StoredLocalSymbolFont): Promise<LocalSymbolFont> {
  return register(record.bytes, record.source, {}, { id: record.id }).then((font) => {
    if (font.persisted) return font;
    const persisted = Object.freeze({ ...font, persisted: true });
    fonts.value = Object.freeze(
      fonts.value.map((item) => (item.id === font.id ? persisted : item)),
    );
    return persisted;
  });
}

/** Lazy opt-in assets only. No new system permission or OS-font discovery. */
export function restoreStoredLocalSymbolFonts(): Promise<readonly LocalSymbolFont[]> {
  if (restorePromise) return restorePromise;
  restorePromise = run(
    "restoring",
    async () => {
      const records = await readStoredLocalSymbolFonts();
      const restored: LocalSymbolFont[] = [];
      let failure: LocalSymbolFontError | undefined;
      for (const record of records) {
        try {
          restored.push(await restore(record));
        } catch (error) {
          // Restore other validated assets even if a single saved face is unavailable.
          failure ??= localFontFailure(error, "storage-corrupt");
        }
      }
      if (failure) throw failure;
      return restored;
    },
    "storage-unavailable",
  ).finally(() => {
    restorePromise = undefined;
  });
  return restorePromise;
}

export function ensureLocalSymbolFont(family: string): Promise<LocalSymbolFont | undefined> {
  const existing = fonts.value.find((font) => font.family === family);
  if (existing) return Promise.resolve(existing);
  const match = /^SheetcraftLocal_([a-f0-9]{64})$/.exec(family);
  if (!match) return Promise.resolve(undefined);
  return run(
    "restoring",
    async () => {
      const record = await readStoredLocalSymbolFont(match[1]!);
      return record ? restore(record) : undefined;
    },
    "storage-unavailable",
  );
}
