/** Per-room last-writer-wins engine mode, merged during Supabase state pulls.
 * A fixed persisted app-settings key avoids new SQL tables or per-room state keys.
 */
export const GROUP_MODE_SCHEMA = 'aigf-group-mode-register-v1';
export type GroupModeRecord = { enabled: boolean; updatedAt: number };
export type GroupModeRegister = { schema: typeof GROUP_MODE_SCHEMA; rooms: Record<string, GroupModeRecord> };
const MAX_ROOMS = 256;
const validId = (id: string) => Boolean(id && id.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(id));
export const emptyGroupModeRegister = (): GroupModeRegister => ({ schema: GROUP_MODE_SCHEMA, rooms: {} });
export const parseGroupModeRegister = (raw: unknown): GroupModeRegister => {
    let candidate: unknown = raw;
    if (typeof raw === 'string') {
        if (raw.length > 100_000) return emptyGroupModeRegister();
        try { candidate = JSON.parse(raw); } catch { return emptyGroupModeRegister(); }
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return emptyGroupModeRegister();
    const input = candidate as Record<string, unknown>;
    if (input.schema !== GROUP_MODE_SCHEMA || !input.rooms
        || typeof input.rooms !== 'object' || Array.isArray(input.rooms)) return emptyGroupModeRegister();
    const records: Array<[string, GroupModeRecord]> = [];
    for (const [id, value] of Object.entries(input.rooms)) {
        if (!validId(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
        const record = value as Partial<GroupModeRecord>;
        if (typeof record.enabled !== 'boolean' || typeof record.updatedAt !== 'number'
            || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0) continue;
        records.push([id, {enabled: record.enabled, updatedAt: record.updatedAt}]);
    }
    records.sort((a,b) => b[1].updatedAt - a[1].updatedAt || a[0].localeCompare(b[0]));
    const selected = records.slice(0, MAX_ROOMS).sort((a,b) => a[0].localeCompare(b[0]));
    return {schema: GROUP_MODE_SCHEMA, rooms: Object.fromEntries(selected)};
};
export const mergeGroupModeRegisters = (local: unknown, remote: unknown): GroupModeRegister => {
    const left = parseGroupModeRegister(local).rooms;
    const right = parseGroupModeRegister(remote).rooms;
    const all: Record<string, GroupModeRecord> = Object.create(null);
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        const a = left[key], b = right[key];
        // Tie-breaker is deterministic: prefer V1 on equal timestamps.
        all[key] = !a ? b : !b ? a
            : a.updatedAt > b.updatedAt ? a
            : b.updatedAt > a.updatedAt ? b
            : {enabled: a.enabled && b.enabled, updatedAt: a.updatedAt};
    }
    return parseGroupModeRegister({schema: GROUP_MODE_SCHEMA,rooms:all});
};
export const recordGroupMode = (raw: unknown, roomId: string, enabled: boolean, now: number): GroupModeRegister => {
    if (!validId(roomId)) throw Error('INVALID_ROOM_ID');
    const register = parseGroupModeRegister(raw);
    const previous = register.rooms[roomId];
    const time = Math.max(Number.isSafeInteger(now) && now > 0 ? now : 1, (previous?.updatedAt || 0) + 1);
    return parseGroupModeRegister({schema: GROUP_MODE_SCHEMA,
      rooms:{...register.rooms, [roomId]:{enabled, updatedAt:time}}});
};
