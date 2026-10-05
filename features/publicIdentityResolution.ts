import type { PublicIdentity } from '../managers.js';
import type { PublicIdentityCandidate, PublicIdentityMedia } from '../publicIdentity.js';
import type { PublicIdentityResolution } from './publicIdentitySearch.js';
import {
    generateVeniceText,
    VENICE_AUTH_REQUIRED_ERROR,
    VENICE_CHAT_MODEL,
    VENICE_GOD_FALLBACK_MODEL,
    VENICE_GOD_MODEL,
} from '../venice.js';
import type { VeniceMessage } from '../venice.js';

export type PublicIdentityResolutionDependencies = {
    handleAuthRequired: () => void;
};

const extractXmlTag = (text: string, tag: string) => {
    const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim() || '';
};

const runPublicIdentityModelCall = async (
    messages: VeniceMessage[],
    maxCompletionTokens = 700,
): Promise<string> => {
    const models = Array.from(
        new Set([VENICE_GOD_MODEL, VENICE_GOD_FALLBACK_MODEL, VENICE_CHAT_MODEL].filter(Boolean)),
    );
    let lastError: Error | null = null;

    for (const model of models) {
        try {
            const result = await generateVeniceText({
                model,
                messages,
                maxCompletionTokens,
                temperature: 0.25,
                topP: 0.9,
                repetitionPenalty: 1.02,
            });
            const cleaned = result.text.trim();
            if (cleaned) return cleaned;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('無法整理公開身份資料。');
};

export const buildConfirmedPublicIdentity = async (
    candidate: PublicIdentityCandidate,
    selectedMedia: PublicIdentityMedia | null,
): Promise<PublicIdentity> => {
    const candidateText = `${candidate.description} ${candidate.extract}`;
    const fallbackKind: PublicIdentity['kind'] = /(?:fictional|character|video game|manga|anime|novel|comic)/iu.test(candidateText)
        ? 'fictional_character'
        : /(?:born|person|singer|actor|actress|model|athlete|politician|artist|performer|musician)/iu.test(candidateText)
            ? 'real_person'
            : 'other';

    const response = await runPublicIdentityModelCall([
        {
            role: 'system',
            content: [
                'You convert one user-confirmed Wikipedia result into factual identity metadata for character consistency and text-to-image prompting.',
                'Use only the supplied public encyclopedia text. Do not invent private facts, facial measurements, scenes, poses, clothes, or relationships.',
                'For a real person, make the English visual prompt lead with the best-known public name, legal name if supplied, nationality, and public profession so an image model identifies the exact person rather than a generic demographic.',
                'For a fictional character, name the franchise and original medium. Describe the canonical design and broad original visual language without naming or imitating a living artist. Keep it illustrated/game-like when the source is not live action.',
                'Write summary_zh in concise Traditional Chinese. Return only these XML tags:',
                '<kind>real_person|fictional_character|other</kind>',
                '<canonical_name>best-known canonical name</canonical_name>',
                '<summary_zh>one or two factual Traditional Chinese sentences</summary_zh>',
                '<visual_prompt_en>identity-only English image prompt</visual_prompt_en>',
                '<style_prompt_en>fictional source-medium style guidance, or empty for a real person</style_prompt_en>',
            ].join('\n'),
        },
        {
            role: 'user',
            content: [
                `Wikipedia title: ${candidate.title}`,
                `Wikipedia language: ${candidate.language}`,
                `Wikidata description: ${candidate.description || 'not supplied'}`,
                `Article introduction: ${candidate.extract || 'not supplied'}`,
                `Source: ${candidate.pageUrl}`,
            ].join('\n'),
        },
    ]);

    const rawKind = extractXmlTag(response, 'kind');
    const kind: PublicIdentity['kind'] = rawKind === 'fictional_character' || rawKind === 'other' || rawKind === 'real_person'
        ? rawKind
        : fallbackKind;
    const canonicalName = extractXmlTag(response, 'canonical_name') || candidate.title;
    const summary = extractXmlTag(response, 'summary_zh')
        || `${candidate.title}：${candidate.description || candidate.extract}`.slice(0, 900);
    const visualPrompt = extractXmlTag(response, 'visual_prompt_en') || (
        kind === 'fictional_character'
            ? `${candidate.title}, the canonical fictional character described as ${candidate.description}. Preserve the recognizable franchise identity and canonical character design.`
            : `${candidate.title}, ${candidate.description}, the recognizable real public figure; preserve her exact well-known identity rather than generating a generic lookalike.`
    );
    const stylePrompt = extractXmlTag(response, 'style_prompt_en');

    return {
        canonicalName: canonicalName.slice(0, 180),
        kind,
        summary: summary.slice(0, 1200),
        visualPrompt: visualPrompt.slice(0, 1400),
        stylePrompt: stylePrompt.slice(0, 800) || undefined,
        sourceTitle: candidate.title,
        sourceUrl: candidate.pageUrl,
        sourceLanguage: candidate.language,
        referenceImageUrl: selectedMedia?.thumbnailUrl,
        referenceImageSourceUrl: selectedMedia?.sourceUrl,
        verifiedAt: Date.now(),
    };
};

export const requestResolvedPublicIdentity = async (
    initialQuery: string,
    dependencies: PublicIdentityResolutionDependencies,
): Promise<PublicIdentityResolution | null> => {
    const { requestPublicIdentityResolution } = await import('./publicIdentitySearch.js');
    return requestPublicIdentityResolution(initialQuery, {
        buildConfirmedIdentity: buildConfirmedPublicIdentity,
        isAbortError: error => typeof DOMException !== 'undefined'
            && error instanceof DOMException
            && error.name === 'AbortError',
        handleAuthRequired: dependencies.handleAuthRequired,
        authRequiredError: VENICE_AUTH_REQUIRED_ERROR,
    });
};
