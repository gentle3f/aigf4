const DATABASE_NAME = 'aigf4-private-avatars';
const DATABASE_VERSION = 1;
const AVATAR_STORE = 'avatars';

interface StoredPersonaAvatar {
    personaKey: string;
    blob: Blob;
    updatedAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser does not support private avatar storage.'));
            return;
        }

        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onerror = () => reject(request.error || new Error('Unable to open private avatar storage.'));
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(AVATAR_STORE)) {
                database.createObjectStore(AVATAR_STORE, { keyPath: 'personaKey' });
            }
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
    });

    return databasePromise;
};

const runRequest = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(AVATAR_STORE, mode);
        const request = operation(transaction.objectStore(AVATAR_STORE));
        let result!: T;

        request.onsuccess = () => {
            result = request.result;
        };
        request.onerror = () => reject(request.error || new Error('Private avatar request failed.'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('Private avatar transaction failed.'));
    });
};

const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('Unable to prepare the selected avatar.');
    return response.blob();
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to restore the saved avatar.'));
    reader.readAsDataURL(blob);
});

export const savePersonaAvatar = async (personaKey: string, dataUrl: string) => {
    if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Only local image avatars can be saved in private avatar storage.');
    }

    const blob = await dataUrlToBlob(dataUrl);
    await runRequest('readwrite', store => store.put({
        personaKey,
        blob,
        updatedAt: Date.now(),
    } satisfies StoredPersonaAvatar));

    try {
        await navigator.storage?.persist?.();
    } catch {
        // Persistence is best-effort; IndexedDB remains available without it.
    }
};

export const deletePersonaAvatar = async (personaKey: string) => {
    await runRequest('readwrite', store => store.delete(personaKey));
};

export const loadPersonaAvatars = async () => {
    const records = await runRequest<StoredPersonaAvatar[]>('readonly', store => store.getAll());
    const entries = await Promise.all(records.map(async record => (
        [record.personaKey, await blobToDataUrl(record.blob)] as const
    )));
    return Object.fromEntries(entries) as Record<string, string>;
};
