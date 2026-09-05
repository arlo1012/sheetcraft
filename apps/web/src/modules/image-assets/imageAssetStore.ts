export type ImageAsset = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  blob: Blob;
};

export type ImageAssetStore = {
  get(id: string): Promise<ImageAsset | undefined>;
  put(asset: ImageAsset): Promise<void>;
};

const DATABASE_NAME = "idea10-image-assets";
const STORE_NAME = "assets";

export function createMemoryImageAssetStore(): ImageAssetStore {
  const assets = new Map<string, ImageAsset>();
  return {
    async get(id) {
      return assets.get(id);
    },
    async put(asset) {
      assets.set(asset.id, asset);
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open image storage."));
    request.onblocked = () => reject(new Error("Image storage is blocked."));
    request.onsuccess = () => resolve(request.result);
  });
}

export function createIndexedDbImageAssetStore(): ImageAssetStore {
  let database: Promise<IDBDatabase> | undefined;
  const getDatabase = () => (database ??= openDatabase());
  return {
    async get(id) {
      const db = await getDatabase();
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onerror = () => reject(request.error ?? new Error("Could not read image asset."));
        request.onsuccess = () => resolve(request.result as ImageAsset | undefined);
      });
    },
    async put(asset) {
      const db = await getDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Could not save image asset."));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Could not save image asset."));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(STORE_NAME).put(asset, asset.id);
      });
    },
  };
}
