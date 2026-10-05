export interface ImagePixelSanity {
    totalPixels: number;
    visiblePixels: number;
    transparentRatio: number;
    nearBlackRatio: number;
    averageLuma: number;
    lumaStdDev: number;
    maxVisibleChannel: number;
    suspiciouslyBlank: boolean;
}

export const analyzeImagePixelData = (
    data: Uint8ClampedArray,
): ImagePixelSanity => {
    const totalPixels = Math.floor(data.length / 4);
    if (totalPixels <= 0) {
        return {
            totalPixels: 0,
            visiblePixels: 0,
            transparentRatio: 1,
            nearBlackRatio: 1,
            averageLuma: 0,
            lumaStdDev: 0,
            maxVisibleChannel: 0,
            suspiciouslyBlank: true,
        };
    }

    let visiblePixels = 0;
    let nearBlackPixels = 0;
    let lumaSum = 0;
    let lumaSquareSum = 0;
    let maxVisibleChannel = 0;

    for (let offset = 0; offset + 3 < data.length; offset += 4) {
        const red = data[offset] || 0;
        const green = data[offset + 1] || 0;
        const blue = data[offset + 2] || 0;
        const alpha = data[offset + 3] || 0;
        if (alpha <= 16) continue;

        visiblePixels += 1;
        const maxChannel = Math.max(red, green, blue);
        maxVisibleChannel = Math.max(maxVisibleChannel, maxChannel);
        if (maxChannel <= 8) nearBlackPixels += 1;

        const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        lumaSum += luma;
        lumaSquareSum += luma * luma;
    }

    const transparentRatio = 1 - visiblePixels / totalPixels;
    const nearBlackRatio = visiblePixels > 0 ? nearBlackPixels / visiblePixels : 1;
    const averageLuma = visiblePixels > 0 ? lumaSum / visiblePixels : 0;
    const variance = visiblePixels > 0
        ? Math.max(0, lumaSquareSum / visiblePixels - averageLuma * averageLuma)
        : 0;
    const lumaStdDev = Math.sqrt(variance);

    const suspiciouslyTransparent = transparentRatio >= 0.98;
    const suspiciouslyBlack = visiblePixels > 0
        && nearBlackRatio >= 0.97
        && averageLuma <= 7
        && lumaStdDev <= 5
        && maxVisibleChannel <= 24;

    return {
        totalPixels,
        visiblePixels,
        transparentRatio,
        nearBlackRatio,
        averageLuma,
        lumaStdDev,
        maxVisibleChannel,
        suspiciouslyBlank: suspiciouslyTransparent || suspiciouslyBlack,
    };
};

const loadImageElement = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
        cleanup();
        resolve(image);
    };
    image.onerror = () => {
        cleanup();
        reject(new Error('生成的照片無法解碼。'));
    };
    image.src = objectUrl;
});

export const validateGeneratedImageBlob = async (blob: Blob): Promise<ImagePixelSanity> => {
    if (!blob || blob.size < 512) {
        throw new Error('圖片模型回傳了空白或不完整的照片，請重試生成。');
    }
    if (blob.type && !blob.type.startsWith('image/')) {
        throw new Error('圖片模型回傳了無效的檔案格式，請重試生成。');
    }

    let source: ImageBitmap | HTMLImageElement;
    let width = 0;
    let height = 0;
    let closeBitmap: (() => void) | undefined;

    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        source = bitmap;
        width = bitmap.width;
        height = bitmap.height;
        closeBitmap = () => bitmap.close();
    } else {
        const image = await loadImageElement(blob);
        source = image;
        width = image.naturalWidth;
        height = image.naturalHeight;
    }

    try {
        if (width <= 0 || height <= 0) {
            throw new Error('圖片模型回傳了無法顯示的照片，請重試生成。');
        }

        const maxSide = 32;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const sampleWidth = Math.max(1, Math.round(width * scale));
        const sampleHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            throw new Error('瀏覽器暫時無法檢查生成照片，請重試。');
        }
        context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
        const analysis = analyzeImagePixelData(
            context.getImageData(0, 0, sampleWidth, sampleHeight).data,
        );
        if (analysis.suspiciouslyBlank) {
            throw new Error('圖片模型回傳了一張近乎全黑或空白的異常照片，已停止儲存；請按「重試生成」。');
        }
        return analysis;
    } finally {
        closeBitmap?.();
    }
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_MESSAGE_PATTERN = /(?:demand|too many requests|rate[ -]?limit|overload|busy|capacity|temporar|try again|unavailable|service unavailable)/iu;

export const isRetryableCharacterPhotoImageError = (error: unknown) => {
    const status = error && typeof error === 'object' && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : NaN;
    if (Number.isFinite(status) && RETRYABLE_STATUS_CODES.has(status)) return true;
    return error instanceof Error && RETRYABLE_MESSAGE_PATTERN.test(error.message);
};

export const runWithTransientImageRetry = async <T>(
    request: () => Promise<T>,
    options: {
        signal?: AbortSignal;
        onRetry?: (error: unknown) => void;
        waitMs?: number;
        sleep?: (milliseconds: number) => Promise<void>;
    } = {},
): Promise<{ result: T; retried: boolean }> => {
    const sleep = options.sleep || (milliseconds => new Promise(resolve => {
        window.setTimeout(resolve, milliseconds);
    }));
    const waitMs = options.waitMs ?? 900;

    try {
        return { result: await request(), retried: false };
    } catch (error) {
        if (options.signal?.aborted || !isRetryableCharacterPhotoImageError(error)) throw error;
        options.onRetry?.(error);
        await sleep(waitMs);
        if (options.signal?.aborted) {
            throw new DOMException('Image generation aborted.', 'AbortError');
        }
        return { result: await request(), retried: true };
    }
};
