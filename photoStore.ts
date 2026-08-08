const DATABASE_NAME = 'aigf4-media';
const DATABASE_VERSION = 1;
const PHOTO_STORE_NAME = 'characterPhotos';

export interface CharacterPhotoAsset {
    id: string;
    personaKey: string;
    blob: Blob;
    prompt: string;
    createdAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

const openPhotoDatabase = () => {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onerror = () => reject(request.error || new Error('Unable to open the character photo database.'));
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
                database.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });

    return databasePromise;
};

const runPhotoStoreRequest = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    const database = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PHOTO_STORE_NAME, mode);
        const request = operation(transaction.objectStore(PHOTO_STORE_NAME));
        let result!: T;
        request.onsuccess = () => {
            result = request.result;
        };
        request.onerror = () => reject(request.error || new Error('The character photo request failed.'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('The character photo transaction was aborted.'));
    });
};

export const saveCharacterPhotoAsset = async (asset: CharacterPhotoAsset) => {
    await runPhotoStoreRequest('readwrite', store => store.put(asset));
    return asset.id;
};

export const getCharacterPhotoAsset = async (id: string) => {
    return runPhotoStoreRequest<CharacterPhotoAsset | undefined>('readonly', store => store.get(id));
};

export const getCharacterPhotoBlob = async (id: string) => {
    const asset = await getCharacterPhotoAsset(id);
    return asset?.blob || null;
};

export const deleteCharacterPhotoAsset = async (id: string) => {
    await runPhotoStoreRequest('readwrite', store => store.delete(id));
};
