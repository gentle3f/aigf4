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


export interface PendingCloudConflictInput {
    deviceHasSynced: boolean;
    hasPendingChanges: boolean;
    cloudStateExists: boolean;
    cloudSourceDeviceId?: string | null;
    localDeviceId: string;
}

export const shouldRecoverPendingCloudConflict = ({
    deviceHasSynced,
    hasPendingChanges,
    cloudStateExists,
    cloudSourceDeviceId,
    localDeviceId,
}: PendingCloudConflictInput) => (
    deviceHasSynced
    && hasPendingChanges
    && cloudStateExists
    && cloudSourceDeviceId !== localDeviceId
);
