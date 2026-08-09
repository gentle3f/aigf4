export const FAVORITE_PHOTO_PROMPT_MAX_LENGTH = 600;

export const normalizeFavoritePhotoPrompt = (value: unknown) => (
    String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, FAVORITE_PHOTO_PROMPT_MAX_LENGTH)
);

export const cleanGeneratedPhotoPrompt = (value: unknown) => {
    const normalized = String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim();
    if (!normalized) return '';

    return normalized
        .replace(/\((?:note|remark|important|備註|注意)\s*:[^)]*(?:favorite|preference|instruction|conflict|continuity|omit|ignore|常用|衝突|忽略)[^)]*\)/giu, ' ')
        .split(/(?<=[.!?。！？])\s+/u)
        .filter(sentence => !(
            /(?:favorite|saved|preference|instruction|常用|預設)/iu.test(sentence)
            && /(?:conflict|continuity|omit|ignore|not applied|discard|衝突|忽略|未套用|捨棄)/iu.test(sentence)
        ))
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
};

export const selectPhotoPromptVersion = (
    basePrompt: string,
    favoritePromptVersion: string | undefined,
    favoritePromptApplied: boolean,
) => (
    favoritePromptApplied && favoritePromptVersion?.trim()
        ? favoritePromptVersion.trim()
        : basePrompt.trim()
);
