import type { VeniceImageMode, VeniceImageModelSummary } from '../veniceImage.js';

export type CharacterPhotoContentMode = 'general' | 'nsfw';

const NSFW_PHOTO_PATTERN = /(?:\bnsfw\b|18\+|adult\s+content|explicit(?:ly)?\s+(?:adult|sexual)|nude|nudity|naked|topless|bottomless|lingerie|sex(?:ual|ually)?|intercourse|oral\s+sex|masturbat|orgasm|cum(?:ming)?|ejaculat|penetrat|fetish|bdsm|bondage|乳房|乳頭|裸體|全裸|半裸|露點|性愛|性交|口交|自慰|高潮|射精|插入|性器官|陰莖|陰道|調教|綁縛|18禁|成人內容)/iu;

export const inferCharacterPhotoContentMode = (...values: Array<string | null | undefined>): CharacterPhotoContentMode => (
    NSFW_PHOTO_PATTERN.test(values.filter(Boolean).join('\n'))
        ? 'nsfw'
        : 'general'
);

export const isUncensoredCharacterPhotoModel = (model: VeniceImageModelSummary) => (
    model.traits.includes('most_uncensored')
    || /(?:uncensored|lustify)/iu.test(model.id)
);

const byId = (models: VeniceImageModelSummary[], id: string) => models.find(model => model.id === id);

const pushUnique = (
    target: VeniceImageModelSummary[],
    candidate: VeniceImageModelSummary | undefined,
) => {
    if (candidate && !target.some(model => model.id === candidate.id)) target.push(candidate);
};

export const buildCharacterPhotoModelLadder = ({
    mode,
    models,
    primaryModelId,
    contentMode,
    limit = 3,
}: {
    mode: VeniceImageMode;
    models: VeniceImageModelSummary[];
    primaryModelId?: string;
    contentMode: CharacterPhotoContentMode;
    limit?: number;
}) => {
    const ladder: VeniceImageModelSummary[] = [];
    const primary = primaryModelId ? byId(models, primaryModelId) : undefined;

    if (contentMode === 'nsfw') {
        if (mode === 'edit') {
            pushUnique(ladder, byId(models, 'qwen-edit-uncensored'));
            pushUnique(ladder, models.find(isUncensoredCharacterPhotoModel));
            pushUnique(ladder, primary);
            pushUnique(ladder, byId(models, 'grok-imagine-edit'));
            pushUnique(ladder, byId(models, 'qwen-image-2-edit'));
        } else {
            pushUnique(ladder, byId(models, 'lustify-v8'));
            pushUnique(ladder, byId(models, 'lustify-v7'));
            pushUnique(ladder, models.find(isUncensoredCharacterPhotoModel));
            pushUnique(ladder, primary);
            pushUnique(ladder, byId(models, 'grok-imagine-image'));
        }
    } else if (mode === 'edit') {
        pushUnique(ladder, primary);
        pushUnique(ladder, byId(models, 'grok-imagine-edit'));
        pushUnique(ladder, byId(models, 'qwen-image-2-edit'));
        pushUnique(ladder, byId(models, 'firered-image-edit'));
    } else {
        pushUnique(ladder, primary);
        pushUnique(ladder, byId(models, 'grok-imagine-image'));
        pushUnique(ladder, byId(models, 'flux-2-pro'));
        pushUnique(ladder, byId(models, 'qwen-image-3-pro'));
    }

    for (const model of models) {
        if (ladder.length >= limit) break;
        pushUnique(ladder, model);
    }
    return ladder.slice(0, Math.max(1, limit));
};
