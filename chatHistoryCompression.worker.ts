import LZString from 'lz-string';

type CompressRequest = {
    version: number;
    value: unknown;
};

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = ({ data }: MessageEvent<CompressRequest>) => {
    const serializeStartedAt = performance.now();
    const json = JSON.stringify(data.value);
    const serializedAt = performance.now();
    const compressed = LZString.compressToUTF16(json);
    const finishedAt = performance.now();
    scope.postMessage({
        version: data.version,
        encoded: `lz16:${compressed}`,
        jsonChars: json.length,
        compressedChars: compressed.length,
        jsonSerializeMs: Math.round(serializedAt - serializeStartedAt),
        compressionMs: Math.round(finishedAt - serializedAt),
    });
};
