export const normalizeCloudStateRevision = (value: unknown) => {
    const revision = Number(value);
    return Number.isFinite(revision) && revision > 0
        ? Math.floor(revision)
        : 0;
};

export const isCloudStateRevisionConflict = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const record = error as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
        hint?: unknown;
    };
    const text = [
        record.message,
        record.details,
        record.hint,
    ].filter(value => typeof value === 'string').join(' ');
    return record.code === '40001' || /WETAPP_STATE_(?:REVISION_)?CONFLICT/u.test(text);
};
