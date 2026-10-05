export type RoomRecovery = { baseline: string | null; data: string };

let queue: Promise<unknown> = Promise.resolve();

function transaction<T>(
    write: boolean,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open('wetapp-room-recovery', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('recovery');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('recovery', write ? 'readwrite' : 'readonly');
            const request = run(tx.objectStore('recovery'));
            tx.oncomplete = () => {
                db.close();
                resolve(request.result);
            };
            tx.onabort = () => {
                db.close();
                reject(tx.error || new Error('Room recovery write aborted'));
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
    });
}

export const readRoomRecovery = () => (
    transaction<RoomRecovery | undefined>(false, store => store.get('rooms'))
);

export function saveRoomRecovery(value: RoomRecovery | null) {
    const next = queue.catch(() => undefined).then(() => transaction(true, store => (
        value ? store.put(value, 'rooms') : store.delete('rooms')
    )));
    queue = next;
    return next;
}
