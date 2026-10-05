import type {
    CharacterPhotoProposal,
    Persona,
} from '../managers.js';
import type { ChatRoom } from '../roomManager.js';
import type { ChatModelSettings } from '../chatModelSettings.js';
import { buildCharacterModelRoute } from '../chatModelSettings.js';
import {
    cleanGeneratedPhotoPrompt,
    normalizeFavoritePhotoPrompt,
} from '../photoPromptPreference.js';
import { inferCharacterPhotoContentMode } from './characterPhotoImagePolicy.js';
import type { VeniceMessage } from '../venice.js';

export interface CharacterPhotoDraftRequest {
    id: number;
    personaKey: string;
    conversationKey: string;
    persona: Persona;
    room?: ChatRoom;
    photoSenderMemberId?: string;
    photoSubjectMemberIds?: string[];
    signal: AbortSignal;
}

export interface CharacterPhotoProposalDraft {
    reply: string;
    scenePrompt: string;
    favoriteScenePrompt?: string;
    caption: string;
    aspectRatio: CharacterPhotoProposal['aspectRatio'];
}

export interface CharacterPhotoDraftGenerationResult {
    draft: CharacterPhotoProposalDraft;
    favoritePrompt: string;
    subjectPersonas: Persona[];
    isMultiSubject: boolean;
    usesPublicIdentity: boolean;
    usesAnyPublicIdentity: boolean;
    useAvatarReference: boolean;
    contentMode: 'general' | 'nsfw';
}

export interface CharacterPhotoDraftModelRequest {
    model: string;
    messages: VeniceMessage[];
    temperature: number;
    topP: number;
    repetitionPenalty: number;
    responseFormat: unknown;
    signal: AbortSignal;
}

export interface CharacterPhotoDraftDependencies {
    latestUserMessage: string;
    baseChatSystemPrompt: string;
    latestUserContent: VeniceMessage['content'];
    chatModelSettings: ChatModelSettings;
    getRecentMessages: () => VeniceMessage[];
    setRuntimeState: (state: 'generating' | 'retrying', detail: string) => void;
    runModel: (request: CharacterPhotoDraftModelRequest) => Promise<string>;
    cleanChatReply: (text: string) => string;
    isAbortError: (error: unknown) => boolean;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

const extractPhotoProposalSection = (text: string, tag: string) => {
    const escapedTag = escapeRegExp(tag);
    return text.match(new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*</${escapedTag}>`, 'iu'))?.[1]?.trim() || '';
};

export const parseCharacterPhotoProposalDraft = (
    text: string,
    personaKey: string | undefined,
    cleanChatReply: (text: string) => string,
): CharacterPhotoProposalDraft | null => {
    const unfenced = text
        .replace(/^\s*```(?:json|text)?\s*/iu, '')
        .replace(/\s*```\s*$/iu, '')
        .trim();
    let jsonDraft: Record<string, unknown> | null = null;
    try {
        const parsed = JSON.parse(unfenced) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            jsonDraft = parsed as Record<string, unknown>;
        }
    } catch {
        // Older or fallback models may still return the legacy XML envelope.
    }
    const readJsonString = (key: string) => typeof jsonDraft?.[key] === 'string'
        ? (jsonDraft[key] as string).trim()
        : '';
    const fallbackReply = personaKey === 'cc'
        ? '好呀，我按住而家嘅情境諗好咗點影。你睇吓下面個 Prompt 啱唔啱，確認後我先影。'
        : '好，我已經按照現在的情境構思好照片了。你看看下面的 Prompt 是否正確，確認後我才拍。';
    const fallbackCaption = personaKey === 'cc' ? '影好喇，畀你。' : '拍好了，給你。';
    const reply = cleanChatReply(
        readJsonString('reply') || extractPhotoProposalSection(text, 'reply') || fallbackReply,
    );
    const scenePrompt = cleanGeneratedPhotoPrompt((readJsonString('prompt') || extractPhotoProposalSection(text, 'prompt'))
        .replace(/^```(?:text)?\s*|\s*```$/giu, '')
        .trim());
    const favoriteScenePrompt = cleanGeneratedPhotoPrompt((readJsonString('favorite_prompt') || extractPhotoProposalSection(text, 'favorite_prompt'))
        .replace(/^```(?:text)?\s*|\s*```$/giu, '')
        .trim());
    const caption = cleanChatReply(
        readJsonString('caption') || extractPhotoProposalSection(text, 'caption') || fallbackCaption,
    );
    const rawRatio = readJsonString('ratio')
        || readJsonString('aspect_ratio')
        || extractPhotoProposalSection(text, 'ratio');
    const allowedRatios: CharacterPhotoProposal['aspectRatio'][] = ['1:1', '3:4', '4:5', '16:9', '9:16'];
    const aspectRatio = allowedRatios.includes(rawRatio as CharacterPhotoProposal['aspectRatio'])
        ? rawRatio as CharacterPhotoProposal['aspectRatio']
        : '3:4';

    if (!reply || !scenePrompt || !caption || scenePrompt.length < 20) return null;
    return {
        reply,
        scenePrompt,
        favoriteScenePrompt: favoriteScenePrompt || undefined,
        caption,
        aspectRatio,
    };
};

const usesConfirmedPublicIdentity = (persona: Persona | null | undefined) => Boolean(
    persona?.publicIdentityEnabled && persona.publicIdentity?.canonicalName,
);

const photoEvidenceText = (content: VeniceMessage['content']) => {
    if (typeof content === 'string') return content.replace(/\s+/gu, ' ').trim();
    if (!Array.isArray(content)) return '';
    return content
        .filter(part => part.type === 'text')
        .map(part => part.type === 'text' ? part.text : '')
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
};

export const buildPhotoContinuityEvidence = (
    messages: VeniceMessage[],
    maxMessages = 8,
    maxChars = 7200,
) => {
    const selected = messages
        .map(message => ({
            role: message.role,
            text: photoEvidenceText(message.content),
        }))
        .filter(item => item.text)
        .slice(-Math.max(1, maxMessages));
    const lines = selected.map(item => {
        const speaker = item.role === 'assistant'
            ? 'CHARACTER/GROUP'
            : item.role === 'user'
                ? 'USER'
                : 'SYSTEM';
        return `[${speaker}] ${item.text}`;
    });
    const joined = lines.join('\n');
    return joined.length <= maxChars ? joined : joined.slice(-maxChars);
};

const buildRoomPhotoBaseline = (room: ChatRoom | undefined) => {
    if (!room) return '';
    const present = new Set(room.scene.presentMemberIds);
    const presentNames = room.members
        .filter(member => present.has(member.id))
        .map(member => member.persona.name);
    const wardrobe = [
        room.scene.wardrobe?.user ? `USER: ${room.scene.wardrobe.user}` : '',
        ...room.members
            .filter(member => present.has(member.id))
            .map(member => {
                const outfit = room.scene.wardrobe?.characters?.[member.id];
                return outfit ? `${member.persona.name}: ${outfit}` : '';
            }),
    ].filter(Boolean).join('; ');

    return [
        room.scene.location ? `Location baseline: ${room.scene.location}` : '',
        `Reality layer: ${room.scene.realityLayer}`,
        presentNames.length ? `Present characters: ${presentNames.join(', ')}` : '',
        room.scene.summary ? `Scene summary baseline: ${room.scene.summary}` : '',
        wardrobe ? `Wardrobe baseline: ${wardrobe}` : '',
    ].filter(Boolean).join('\n');
};

export const generateCharacterPhotoProposalDraft = async (
    request: CharacterPhotoDraftRequest,
    dependencies: CharacterPhotoDraftDependencies,
): Promise<CharacterPhotoDraftGenerationResult> => {
    const favoritePrompt = normalizeFavoritePhotoPrompt(
        request.room ? request.room.favoritePhotoPrompt : request.persona.favoritePhotoPrompt,
    );
    const subjectMembers = request.room
        ? request.room.members.filter(member => request.photoSubjectMemberIds?.includes(member.id))
        : [];
    const subjectPersonas = subjectMembers.length > 0
        ? subjectMembers.map(member => member.persona)
        : [request.persona];
    const isMultiSubject = subjectPersonas.length > 1;
    const usesPublicIdentity = usesConfirmedPublicIdentity(request.persona);
    const usesAnyPublicIdentity = subjectPersonas.some(usesConfirmedPublicIdentity);
    const useAvatarReference = Boolean(
        !isMultiSubject
        && !usesPublicIdentity
        && request.persona.avatarUrl
        && !request.persona.avatarUrl.startsWith('generating_'),
    );
    const publicIdentity = request.persona.publicIdentity;
    const recentMessages = dependencies.getRecentMessages();
    while (recentMessages[0]?.role === 'assistant') recentMessages.shift();
    const continuityEvidence = buildPhotoContinuityEvidence(recentMessages);
    const roomBaseline = buildRoomPhotoBaseline(request.room);
    const imagePromptIdentityRules = isMultiSubject
        ? [
            `This is one group photo with exactly ${subjectPersonas.length} distinct people: ${subjectPersonas.map(persona => persona.publicIdentity?.canonicalName || persona.name).join(', ')}.`,
            'No reference image will be supplied. Begin <prompt> by listing every person by exact name. Keep each face, body, clothing, pose and action separate; do not merge, clone, omit or add people.',
            ...subjectPersonas.map(persona => {
                const identity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
                return identity
                    ? `${persona.name}: canonical identity ${identity.canonicalName}; ${identity.visualPrompt}; ${identity.summary}`
                    : `${persona.name}: ${persona.avatarPrompt || persona.description}`;
            }),
        ]
        : usesPublicIdentity && publicIdentity
        ? [
            'No reference image will be supplied. The app will add a user-confirmed public identity block separately.',
            `Inside the prompt field, begin exactly with "${publicIdentity.canonicalName}" and thereafter refer to the subject consistently. Describe the requested scene, pose, action, expression, clothing or requested state, setting, lighting, framing, viewpoint, and relevant objects.`,
            publicIdentity.kind === 'fictional_character'
                ? 'Keep the scene compatible with the character’s canonical franchise design and original source-medium visual language; do not turn the character into a generic photorealistic person.'
                : 'Do not replace the named public figure with a generic nationality, ethnicity, age group, or lookalike description.',
        ]
        : useAvatarReference
        ? [
            'A reference portrait will be attached later and is the only source of visual identity.',
            `Inside the prompt field, begin exactly with "${request.persona.name}" and thereafter refer to the subject only as "she". Describe only the requested scene, pose, action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.`,
            'Do not infer or state her age, ethnicity, nationality, facial features, skin tone, eye appearance, hair identity, or body type unless the newest user message explicitly requests that exact visible change.',
            'Never replace her identity with a generic demographic description. The app will add the identity-lock instruction separately.',
        ]
        : [
            `No reference image will be supplied. Inside the prompt field, identify ${request.persona.name} by name and use the established character appearance where useful.`,
            'Describe the subject count and identity, visible pose or action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.',
        ];
    const systemPrompt = [
        dependencies.baseChatSystemPrompt,
        request.room ? [
            `This request belongs to fixed room "${request.room.title}".`,
            `The character preparing the photo is ${request.persona.name} (${request.photoSenderMemberId || request.room.leadMemberId}).`,
            `The requested visible character subjects are: ${subjectPersonas.map(persona => persona.name).join(', ')}.`,
            'Do not make an absent or unselected room member visible in the image.',
        ].join('\n') : '',
        roomBaseline ? [
            'ROOM/SCENE BASELINE — SECONDARY EVIDENCE ONLY:',
            roomBaseline,
            'Use this baseline for durable facts such as location, reality layer, presence and established wardrobe only when the recent completed conversation has not changed or refined them.',
        ].join('\n') : '',
        continuityEvidence ? [
            'PHOTO CONTINUITY EVIDENCE — PRIMARY EVIDENCE:',
            continuityEvidence,
            'The newest completed turns above outrank a stale room summary. Infer what the visible subjects are actually doing right now from these turns before composing the photo.',
        ].join('\n') : '',
        'The newest user message is a request for the character to take or send a photo.',
        'Do not generate an image and do not claim the photo has already been taken or sent. Stay fully in character and propose exactly what the character intends to photograph.',
        [
            'CURRENT-MOMENT CONTINUITY LOCK:',
            '- Silently reconstruct the exact current physical moment before writing the JSON: who is present, each person\'s clothing and colors, location, time, lighting, body position, held objects, ongoing action, and physical relationships.',
            '- Resolve ongoing action from the newest completed conversation first. Do not substitute an older room/scene summary for what the characters are visibly doing now.',
            '- If recent completed dialogue/narration conflicts with the room summary, recent completed dialogue/narration wins. The room baseline is only a backstop for facts the recent turns did not change.',
            '- That established visible continuity is authoritative. Never change a white shirt to black, add or remove a held object, move to another location, swap people, or contradict the current action unless the newest user photo request explicitly asks for that exact change.',
            '- Resolve pronouns against the fixed character identities. Do not confuse the user, photographer, visible subjects, or third persons.',
            '- Produce one internally coherent image instruction. Never include mutually exclusive colors, clothes, poses, actions, objects, camera views, or both a positive and negative version of the same detail.',
        ].join('\n'),
        'The proposal may be ordinary, romantic, fantasy, or explicitly adult according to the user request and established context. Preserve direct wording and intent; do not make an ordinary request sexual, and do not sanitize an explicit adult request.',
        favoritePrompt ? [
            `SAVED FAVORITE PHOTO INSTRUCTION: ${favoritePrompt}`,
            '- The prompt field must be the clean baseline based only on the newest request and current-moment continuity; do not apply the saved favorite instruction there.',
            '- The favorite_prompt field must be a second complete image prompt that integrates every compatible part of the saved favorite instruction into the same current moment.',
            '- Current visible continuity and the newest explicit request outrank the saved favorite instruction. Silently adapt or omit only the conflicting favorite detail instead of writing both alternatives.',
            '- The two prompts must each stand alone. Do not mention merging, conflicts, defaults, options, checkboxes, omitted details, or these rules inside either prompt.',
            '- Never describe a discarded alternative negatively. If all favorite details conflict, make <favorite_prompt> identical to <prompt>. The final image prompt must contain only the one positive visual truth the image model should draw.',
        ].join('\n') : '',
        ...imagePromptIdentityRules,
        'The English image prompt must describe one still image. Do not invent a new major event or a user action.',
        'Do not merely translate, quote, or paraphrase the user request. Turn it into a production-ready visual prompt by resolving the current environment, clothing, facial expression, body pose, movement, camera angle, framing, lighting, and relevant objects from the latest conversation.',
        'When a visible detail is not established and the user leaves it to the character, choose one specific detail that fits the character and current moment. Never leave placeholders such as "as requested", "appropriate clothing", "same environment", or unresolved options.',
        'Choose one definite composition yourself. Do not offer multiple unresolved clothing, pose, expression, or scene options; the visible reply and English prompt must describe the same single choice.',
        'The reply and later caption must use the character’s established Traditional Chinese regional voice. The reply must briefly describe that one chosen photo and naturally ask the user to approve it without mentioning AI, models, policy, generation, or internal prompts.',
        'Return only one JSON object with these fields: reply, prompt, favorite_prompt, caption, ratio.',
        `prompt must be a complete English still-image ${useAvatarReference ? 'edit instruction of 25 to 70 words' : 'scene prompt of 45 to 100 words'}.`,
        favoritePrompt
            ? 'favorite_prompt must be a second complete English prompt with the compatible saved favorite instruction already reconciled.'
            : 'favorite_prompt must be an empty string.',
        'ratio must be exactly one of 1:1, 3:4, 4:5, 16:9, 9:16.',
    ].join('\n\n');

    const models = buildCharacterModelRoute(dependencies.chatModelSettings, request.personaKey === 'cc');
    let draft: CharacterPhotoProposalDraft | null = null;
    let lastError: Error | null = null;

    for (let modelIndex = 0; modelIndex < models.length && !draft; modelIndex += 1) {
        const model = models[modelIndex];
        dependencies.setRuntimeState(modelIndex === 0 ? 'generating' : 'retrying', '構思照片中...');
        try {
            const resultText = await dependencies.runModel({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: dependencies.latestUserContent },
                ],
                temperature: 0.76,
                topP: 0.92,
                repetitionPenalty: 1.06,
                responseFormat: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'character_photo_proposal',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['reply', 'prompt', 'favorite_prompt', 'caption', 'ratio'],
                            properties: {
                                reply: { type: 'string' },
                                prompt: { type: 'string' },
                                favorite_prompt: { type: 'string' },
                                caption: { type: 'string' },
                                ratio: { type: 'string', enum: ['1:1', '3:4', '4:5', '16:9', '9:16'] },
                            },
                        },
                    },
                },
                signal: request.signal,
            });
            const candidate = parseCharacterPhotoProposalDraft(
                resultText,
                request.personaKey,
                dependencies.cleanChatReply,
            );
            if (!candidate) {
                throw new Error(`Invalid photo proposal from ${model}.`);
            }
            draft = candidate;
        } catch (error) {
            if (dependencies.isAbortError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
            if (modelIndex === models.length - 1) {
                console.warn(
                    'Photo proposal analysis failed across all configured models; refusing stale scene fallback.',
                    lastError,
                );
            }
        }
    }

    if (!draft) {
        throw new Error(
            '未能可靠分析角色剛才正在做甚麼，所以沒有用舊場景資料代替。請重試拍照。',
            { cause: lastError || undefined },
        );
    }
    return {
        draft,
        favoritePrompt,
        subjectPersonas,
        isMultiSubject,
        usesPublicIdentity,
        usesAnyPublicIdentity,
        useAvatarReference,
        contentMode: inferCharacterPhotoContentMode(
            dependencies.latestUserMessage,
            draft.scenePrompt,
            draft.favoriteScenePrompt,
        ),
    };
};
