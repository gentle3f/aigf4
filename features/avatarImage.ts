const readBlobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法讀取圖片。'));
    reader.readAsDataURL(blob);
});

export const optimizeAvatarDataUrl = async (blob: Blob): Promise<string> => {
    if (!blob.type.startsWith('image/')) throw new Error('請選擇有效的圖片檔案。');
    if (blob.size > 25 * 1024 * 1024) throw new Error('頭像圖片不可超過 25MB。');

    const sourceUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = sourceUrl;
    try {
        await image.decode();
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        if (sourceSize < 64) throw new Error('頭像圖片尺寸太小。');

        const sourceX = Math.max(0, Math.round((image.naturalWidth - sourceSize) / 2));
        const sourceY = Math.max(0, Math.round((image.naturalHeight - sourceSize) / 2));
        const outputSize = Math.min(512, sourceSize);
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法處理這張圖片。');
        context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            outputSize,
            outputSize,
        );

        const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error('無法壓縮頭像。'));
            }, 'image/webp', 0.84);
        });
        return readBlobAsDataUrl(optimizedBlob);
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
};
