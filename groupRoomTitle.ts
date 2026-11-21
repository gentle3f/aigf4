/** A room's visible title, independent of member labels and canonical identities. */
export const GROUP_ROOM_TITLE_LIMIT = 48;

export const normalizeGroupRoomTitle = (value: string): string | null => {
    const compact = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!compact || Array.from(compact).length > GROUP_ROOM_TITLE_LIMIT) return null;
    // Do not let a user title become a chat-protocol delimiter or control sequence.
    if (/[<>\u0000-\u001f\u007f]/u.test(compact)) return null;
    return compact;
};
