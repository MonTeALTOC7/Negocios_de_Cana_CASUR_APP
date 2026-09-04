const DB_NAME = "casur-estimador-tch";
const DB_VERSION = 3;

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("No se pudo incluir una fotografía en el respaldo."));
    reader.readAsDataURL(blob);
  });
}

async function serializableVisits(visits) {
  return Promise.all(visits.map(async (visit) => ({
    ...visit,
    photos: await Promise.all((visit.photos || []).map(async (photo) => photo.blob instanceof Blob
      ? { ...photo, blob: undefined, dataUrl: await blobDataUrl(photo.blob) }
      : photo)),
  })));
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transacción cancelada"));
  });
}

async function openDatabase() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("master")) db.createObjectStore("master", { keyPath: "id" });
    if (!db.objectStoreNames.contains("biometries")) {
      const store = db.createObjectStore("biometries", { keyPath: "id" });
      store.createIndex("lotId", "lotId", { unique: false });
      store.createIndex("date", "date", { unique: false });
    }
    if (!db.objectStoreNames.contains("weighings")) {
      const store = db.createObjectStore("weighings", { keyPath: "id" });
      store.createIndex("lotId", "lotId", { unique: false });
    }
    if (!db.objectStoreNames.contains("harvests")) db.createObjectStore("harvests", { keyPath: "id" });
    if (!db.objectStoreNames.contains("visits")) {
      const store = db.createObjectStore("visits", { keyPath: "id" });
      store.createIndex("lotId", "lotId", { unique: false });
      store.createIndex("date", "date", { unique: false });
      store.createIndex("farmCode", "farmCode", { unique: false });
    }
    if (!db.objectStoreNames.contains("audit")) db.createObjectStore("audit", { keyPath: "id" });
    if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
  };
  return requestPromise(request);
}

export class LocalRepository {
  async all(storeName) {
    const db = await openDatabase();
    return requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }

  async get(storeName, key) {
    const db = await openDatabase();
    return requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
  }

  async put(storeName, value) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await transactionPromise(tx);
    return value;
  }

  async putMany(storeName, values) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    await transactionPromise(tx);
    return values.length;
  }

  async replaceAll(storeName, values) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    await transactionPromise(tx);
    return values.length;
  }

  async delete(storeName, key) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await transactionPromise(tx);
  }

  async clear(storeName) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    await transactionPromise(tx);
  }

  async exportAll() {
    const stores = ["master", "biometries", "weighings", "harvests", "visits", "audit", "settings"];
    const payload = { format: "CASUR-TCH-BACKUP", version: 3, exportedAt: new Date().toISOString() };
    for (const store of stores) {
      const rows = await this.all(store);
      payload[store] = store === "visits" ? await serializableVisits(rows) : rows;
    }
    return payload;
  }

  async restoreAll(payload) {
    if (!payload || payload.format !== "CASUR-TCH-BACKUP") throw new Error("El archivo no es un respaldo válido.");
    for (const store of ["master", "biometries", "weighings", "harvests", "visits", "audit", "settings"]) {
      if (Array.isArray(payload[store])) await this.replaceAll(store, payload[store]);
    }
  }
}

export class SupabaseRepository {
  constructor() {
    throw new Error("Sincronización Supabase no configurada. La app funciona completamente en IndexedDB.");
  }
}

export const repository = new LocalRepository();
