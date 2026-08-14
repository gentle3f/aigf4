export type LocalCloudChangeScope = 'state' | 'messages' | 'rooms' | 'media';

export const LOCAL_CLOUD_CHANGE_EVENT = 'wetapp:local-cloud-change';

export const notifyLocalCloudChange = (scope: LocalCloudChangeScope) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(LOCAL_CLOUD_CHANGE_EVENT, { detail: { scope } }));
};
