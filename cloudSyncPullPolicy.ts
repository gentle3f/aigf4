export interface CloudPullPolicyInput {
    force: boolean;
    cloudSourceDeviceId?: string | null;
    localDeviceId: string;
    syncedUserId?: string | null;
    sessionUserId: string;
    hasPendingChanges: boolean;
}

export const shouldSkipRedundantCloudPull = ({
    force,
    cloudSourceDeviceId,
    localDeviceId,
    syncedUserId,
    sessionUserId,
    hasPendingChanges,
}: CloudPullPolicyInput) => (
    !force
    && !hasPendingChanges
    && Boolean(localDeviceId)
    && cloudSourceDeviceId === localDeviceId
    && syncedUserId === sessionUserId
);
