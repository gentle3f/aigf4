export type LocalCloudChangeScope = 'state' | 'messages' | 'rooms' | 'media';

export const LOCAL_CLOUD_CHANGE_EVENT = 'wetapp:local-cloud-change';

type LocalCloudChangeBatchFrame = {
    scopes: Set<LocalCloudChangeScope>;
    closed: boolean;
};

const batchFrames: LocalCloudChangeBatchFrame[] = [];

const dispatchLocalCloudChange = (scope: LocalCloudChangeScope) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(LOCAL_CLOUD_CHANGE_EVENT, { detail: { scope } }));
};

export const isLocalCloudChangeBatchActive = () => batchFrames.length > 0;

export const beginLocalCloudChangeBatch = () => {
    const frame: LocalCloudChangeBatchFrame = {
        scopes: new Set(),
        closed: false,
    };
    batchFrames.push(frame);

    return {
        close(flush = true) {
            if (frame.closed) return;
            frame.closed = true;

            const index = batchFrames.lastIndexOf(frame);
            if (index < 0) return;
            batchFrames.splice(index, 1);

            if (!flush) return;

            const parent = batchFrames.at(-1);
            if (parent) {
                frame.scopes.forEach(scope => parent.scopes.add(scope));
                return;
            }

            frame.scopes.forEach(dispatchLocalCloudChange);
        },
    };
};

export const notifyLocalCloudChange = (scope: LocalCloudChangeScope) => {
    const activeFrame = batchFrames.at(-1);
    if (activeFrame) {
        activeFrame.scopes.add(scope);
        return;
    }
    dispatchLocalCloudChange(scope);
};
