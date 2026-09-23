import LZString from 'lz-string';

const COMPRESSED_PREFIX = 'lz16:';

export type EncodedChatHistoryStorage = {
    encoded: string;
    jsonChars: number;
    compressedChars: number;
};

export const encodeChatHistoryJson = (json: string): EncodedChatHistoryStorage => {
    const compressed = LZString.compressToUTF16(json);
    return {
        encoded: `${COMPRESSED_PREFIX}${compressed}`,
        jsonChars: json.length,
        compressedChars: compressed.length,
    };
};

export const encodeChatHistoryStorageWithMetrics = (value: unknown): EncodedChatHistoryStorage => {
    const json = JSON.stringify(value);
    return encodeChatHistoryJson(json);
};

export const encodeChatHistoryStorage = (value: unknown) => encodeChatHistoryStorageWithMetrics(value).encoded;

export const decodeChatHistoryStorage = <T>(raw: string): T => {
    const json = raw.startsWith(COMPRESSED_PREFIX)
        ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
        : raw;
    if (!json) throw new Error('Saved chat history is empty or corrupt.');
    return JSON.parse(json) as T;
};

export const isCompressedChatHistoryStorage = (raw: string) => raw.startsWith(COMPRESSED_PREFIX);
