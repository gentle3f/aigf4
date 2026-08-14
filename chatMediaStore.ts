import { notifyLocalCloudChange } from './cloudSyncEvents.js';

const DATABASE_NAME = 'aigf4-private-chat';
const DATABASE_VERSION = 1;
const ATTACHMENT_STORE = 'attachments';

export interface StoredChatAttachment {
    id: string;
    conversationKey: string;
    blob: Blob;
    name: string;
    mimeType: string;
    createdAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onerror = () => reject(request.error || new Error('Unable to open private chat storage.'));
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
                const store = database.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
                store.createIndex('conversationKey', 'conversationKey');
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
    return databasePromise;
};

const runRequest = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(ATTACHMENT_STORE, mode);
        const request = operation(transaction.objectStore(ATTACHMENT_STORE));
        let result!: T;
        request.onsuccess = () => {
            result = request.result;
        };
        request.onerror = () => reject(request.error || new Error('Private attachment request failed.'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('Private attachment transaction failed.'));
    });
};

export const saveChatAttachment = async (attachment: StoredChatAttachment) => {
    await runRequest('readwrite', store => store.put(attachment));
    try {
        await navigator.storage?.persist?.();
    } catch {
        // Storage persistence is best-effort and may require browser permission.
    }
    notifyLocalCloudChange('media');
    return attachment.id;
};

export const getChatAttachment = async (id: string) => (
    runRequest<StoredChatAttachment | undefined>('readonly', store => store.get(id))
);

export const getChatAttachmentBlob = async (id: string) => (
    (await getChatAttachment(id))?.blob || null
);

export const deleteChatAttachment = async (id: string) => {
    await runRequest('readwrite', store => store.delete(id));
    notifyLocalCloudChange('media');
};

export const listChatAttachments = async (conversationKey?: string) => {
    const database = await openDatabase();
    return new Promise<StoredChatAttachment[]>((resolve, reject) => {
        const transaction = database.transaction(ATTACHMENT_STORE, 'readonly');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = conversationKey
            ? store.index('conversationKey').getAll(conversationKey)
            : store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Unable to list private attachments.'));
    });
};
