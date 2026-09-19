import LZString from 'lz-string';

const COMPRESSED_PREFIX = 'room-lz16:';

export const encodeRoomStorage = (value: unknown) => (
    `${COMPRESSED_PREFIX}${LZString.compressToUTF16(JSON.stringify(value))}`
);

export const decodeRoomStorage = <T>(raw: string): T => {
    const json = raw.startsWith(COMPRESSED_PREFIX)
        ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
        : raw;
    if (!json) throw new Error('Saved room data is empty or corrupt.');
    return JSON.parse(json) as T;
};

export const isCompressedRoomStorage = (raw: string) => raw.startsWith(COMPRESSED_PREFIX);
