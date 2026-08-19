import LZString from 'lz-string';

const COMPRESSED_PREFIX = 'lz16:';

export const encodeChatHistoryStorage = (value: unknown) => (
    `${COMPRESSED_PREFIX}${LZString.compressToUTF16(JSON.stringify(value))}`
);

export const decodeChatHistoryStorage = <T>(raw: string): T => {
    const json = raw.startsWith(COMPRESSED_PREFIX)
        ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
        : raw;
    if (!json) throw new Error('Saved chat history is empty or corrupt.');
    return JSON.parse(json) as T;
};

export const isCompressedChatHistoryStorage = (raw: string) => raw.startsWith(COMPRESSED_PREFIX);
