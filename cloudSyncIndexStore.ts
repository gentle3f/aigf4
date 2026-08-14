const DATABASE_NAME = 'wetapp-cloud-sync';
const DATABASE_VERSION = 1;
const INDEX_STORE = 'indexes';

interface StoredCloudIndex {
    name: string;
    values: Record<string, string>;
    updatedAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onerror = () => reject(request.error || new Error('Unable to open the cloud sync index.'));
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(INDEX_STORE)) {
                request.result.createObjectStore(INDEX_STORE, { keyPath: 'name' });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
    return databasePromise;
};

const requestIndex = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
) => {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(INDEX_STORE, mode);
        const request = operation(transaction.objectStore(INDEX_STORE));
        let result!: T;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('Cloud sync index request failed.'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('Cloud sync index transaction failed.'));
    });
};

export const readCloudSyncIndex = async (name: string) => {
    const stored = await requestIndex<StoredCloudIndex | undefined>('readonly', store => store.get(name));
    if (stored?.values) return stored.values;

    // Migrate short-lived pre-release indexes out of localStorage if present.
    try {
        const legacy = JSON.parse(localStorage.getItem(name) || '{}');
        if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
            await writeCloudSyncIndex(name, legacy as Record<string, string>);
            localStorage.removeItem(name);
            return legacy as Record<string, string>;
        }
    } catch {
        localStorage.removeItem(name);
    }
    return {};
};

export const writeCloudSyncIndex = async (name: string, values: Record<string, string>) => {
    await requestIndex('readwrite', store => store.put({
        name,
        values,
        updatedAt: Date.now(),
    } satisfies StoredCloudIndex));
};
