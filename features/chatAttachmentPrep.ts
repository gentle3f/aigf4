import type { ChatAttachment } from '../managers.js';

const MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 2_500_000;
const MAX_CHAT_IMAGE_EDGE = 1600;

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('無法壓縮附件圖片。'));
    }, 'image/webp', quality);
});

const getAttachmentKind = (mimeType: string): ChatAttachment['kind'] => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (/pdf|text|json|xml|csv|word|excel|sheet|presentation|markdown|javascript|typescript|yaml|sql/iu.test(mimeType)) {
        return 'document';
    }
    return 'other';
};

export type PreparedChatAttachment = {
    attachment: ChatAttachment;
    file: File;
    previewUrl?: string;
};

export const prepareChatAttachment = async (
    sourceFile: File,
    currentBytes: number,
): Promise<PreparedChatAttachment> => {
    let file = sourceFile;
    let width: number | undefined;
    let height: number | undefined;

    if (sourceFile.type.startsWith('image/')) {
        const sourceUrl = URL.createObjectURL(sourceFile);
        const image = new Image();
        image.src = sourceUrl;
        try {
            await image.decode();
            const scale = Math.min(1, MAX_CHAT_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
            width = Math.max(1, Math.round(image.naturalWidth * scale));
            height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('瀏覽器無法處理這張附件圖片。');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, width, height);
            let blob = await canvasToBlob(canvas, 0.86);
            if (blob.size > 1_500_000) blob = await canvasToBlob(canvas, 0.68);
            const name = sourceFile.name.replace(/\.[^.]+$/u, '') || 'image';
            file = new File([blob], `${name}.webp`, { type: blob.type, lastModified: Date.now() });
        } finally {
            URL.revokeObjectURL(sourceUrl);
        }
    }

    if (currentBytes + file.size > MAX_CHAT_ATTACHMENT_TOTAL_BYTES) {
        throw new Error('本次要交給 AI 分析的附件合計不可超過 2.5MB。圖片已先自動壓縮。');
    }

    const id = crypto.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const attachment: ChatAttachment = {
        id,
        assetId: id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind: getAttachmentKind(file.type || ''),
        width,
        height,
    };
    return {
        attachment,
        file,
        previewUrl: attachment.kind === 'image' ? URL.createObjectURL(file) : undefined,
    };
};
