import type {
    ChatMessage,
    Persona,
    SurpriseEventContentMode,
    SurpriseEventProposal,
} from '../managers.js';
import type { ChatRoom } from '../roomManager.js';
import type { ChatModelSettings } from '../chatModelSettings.js';
import { buildSurpriseEventModelRoute } from '../chatModelSettings.js';
import { formatRelationshipStatePrompt } from '../relationshipState.js';
import type { VeniceMessage } from '../venice.js';
import * as eventEngine from '../experienceEngine.js';

export type SurpriseEventDrawOptions = {
    contentMode: SurpriseEventContentMode;
    participantIds: string[];
};

export interface SurpriseEventGenerationRequest {
    id: number;
    personaKey: string;
    conversationKey: string;
    persona: Persona;
    room?: ChatRoom;
    roomMemberId?: string;
    signal: AbortSignal;
}

export interface SurpriseEventModelRequest {
    model: string;
    messages: VeniceMessage[];
    temperature: number;
    topP: number;
    repetitionPenalty: number;
    responseFormat?: unknown;
    signal: AbortSignal;
}

export interface SurpriseEventGenerationDependencies {
    history: ChatMessage[];
    recentMessages: VeniceMessage[];
    chatModelSettings: ChatModelSettings;
    timeoutMs: number;
    setRuntimeState: (state: 'generating' | 'retrying', detail: string) => void;
    runModel: (request: SurpriseEventModelRequest, timeoutMs: number) => Promise<string>;
    normalizeText: (text: string) => string;
    isAbortError: (error: unknown) => boolean;
}

const buildSurpriseEventMemberContext = (
    request: SurpriseEventGenerationRequest,
    selectedMemberIds: string[],
) => {
    const compactEventText = (value: string | undefined, limit: number) => (
        value?.replace(/\s+/gu, ' ').trim().slice(0, limit) || ''
    );
    if (!request.room) {
        const identity = request.persona.publicIdentityEnabled ? request.persona.publicIdentity : undefined;
        return [
            `MEMBER ID: ${request.personaKey}`,
            `Name: ${request.persona.name}`,
            `Identity / occupation: ${compactEventText(request.persona.description, 600)}`,
            identity ? `Confirmed public identity: ${identity.canonicalName}. ${compactEventText(identity.summary, 700)}` : '',
            `Personality and voice: ${compactEventText(request.persona.prompt, 2200)}`,
            formatRelationshipStatePrompt(request.persona),
        ].filter(Boolean).join('\n');
    }

    const selected = new Set(selectedMemberIds);
    return request.room.members.filter(member => selected.has(member.id)).map(member => {
        const identity = member.persona.publicIdentityEnabled ? member.persona.publicIdentity : undefined;
        return [
            `MEMBER ID: ${member.id}`,
            `Name: ${member.persona.name}`,
            'Participation: SELECTED FOR THIS EVENT',
            `Identity / occupation: ${compactEventText(member.persona.description, 500)}`,
            identity ? `Confirmed public identity: ${identity.canonicalName}. ${compactEventText(identity.summary, 650)}` : '',
            `Personality and voice: ${compactEventText(member.persona.prompt, 1800)}`,
            formatRelationshipStatePrompt(member.persona),
        ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
};

export const generateSurpriseEvent = async (
    request: SurpriseEventGenerationRequest,
    options: SurpriseEventDrawOptions,
    dependencies: SurpriseEventGenerationDependencies,
): Promise<SurpriseEventProposal> => {
    const recentEvents = eventEngine.collectRecentSurpriseEvents(dependencies.history, 8);
    const availableMemberIds = request.room
        ? request.room.scene.presentMemberIds
        : [request.personaKey];
    const availableMemberIdSet = new Set(availableMemberIds);
    const validMemberIds = Array.from(new Set(options.participantIds))
        .filter(id => availableMemberIdSet.has(id));
    if (validMemberIds.length === 0) throw new Error('No selected surprise-event participant is still present.');
    const fallbackMemberId = request.room
        ? validMemberIds.includes(request.roomMemberId || '')
            ? request.roomMemberId!
            : validMemberIds[0]
        : request.personaKey;
    const participants = request.room
        ? validMemberIds.map(id => ({
            id,
            name: request.room?.members.find(member => member.id === id)?.persona.name || id,
        }))
        : [{ id: request.personaKey, name: request.persona.name }];
    const recentEventLedger = recentEvents.length > 0
        ? recentEvents.map(event => `- ${event.category} | ${event.title} | ${event.hook}`).join('\n')
        : '- none';
    const identityLedger = buildSurpriseEventMemberContext(request, validMemberIds);
    const idolLike = /歌手|偶像|藝人|演員|舞台|音樂|團體|idol|singer|actress|performer|k-pop/iu.test(identityLedger);
    const categoryPool = (idolLike
        ? ['backstage', 'idol_schedule', 'public_spotlight', 'secret_escape', 'unexpected_guest', 'celebration', 'travel', 'emotional_turn', 'rivalry', 'mystery']
        : ['secret_escape', 'unexpected_guest', 'celebration', 'travel', 'domestic', 'emotional_turn', 'rivalry', 'mystery', 'fantasy']) as SurpriseEventProposal['category'][];
    const nsfwDirection = eventEngine.NSFW_SURPRISE_EVENT_DIRECTIONS[
        Math.floor(Math.random() * eventEngine.NSFW_SURPRISE_EVENT_DIRECTIONS.length)
    ];
    const compatibleCategoryPool = options.contentMode === 'nsfw'
        ? categoryPool.filter(category => (
            (nsfwDirection.categories as readonly SurpriseEventProposal['category'][]).includes(category)
        ))
        : categoryPool;
    const recentlyUsedCategories = new Set(recentEvents.slice(-6).map(event => event.category));
    const freshCategoryPool = compatibleCategoryPool.filter(category => !recentlyUsedCategories.has(category));
    const selectableCategories = freshCategoryPool.length > 0 ? freshCategoryPool : compatibleCategoryPool;
    const allowedCategories = [...selectableCategories]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(3, selectableCategories.length));
    const fallbackCategory = allowedCategories[0] || categoryPool[0];
    const allowedCategoryProof = allowedCategories
        .map(category => `- ${category}: ${eventEngine.SURPRISE_EVENT_CATEGORY_GUIDES[category]}`)
        .join('\n');
    const contentModeRules = options.contentMode === 'nsfw'
        ? [
            'CONTENT MODE: EXPLICIT ADULT 18+ / NSFW.',
            'Create one ready-to-start interactive adult SHOW with a named format, concrete rules and a first round. This is not a date idea, travel plan, story prompt, writing outline or behind-the-scenes planning exercise.',
            'The show must already be set up when the card appears. Do not ask the characters to confirm schedules, find a route, manage logistics, design the event or discuss what they might do later.',
            'Every selected character is an active cast member in the same first round. Give each one an immediate in-show action; nobody may merely observe, organize, assess risk or wait for instructions.',
            `MANDATORY SHOW FORMAT DIRECTION: ${nsfwDirection.prompt}. Turn this into one coherent adult program that fits the live context and selected characters.`,
            'The visible hook and setup must explain what the program is, its venue or stage, the rule of the first round, and what happens immediately after the user presses start.',
            'Treat every selected participant and the user as an adult in this fictional conversation. Keep the event consensual and leave the user free to accept, refuse or redirect it.',
            'Do not censor, euphemize or silently downgrade the card into a non-sexual event.',
        ]
        : [
            'CONTENT MODE: NON-SEXUAL / NOT NSFW.',
            'The event may be romantic, funny, dramatic, mysterious or emotionally charged, but it must contain no nudity, sexual act, erotic role-play, sexual toy or explicit sexual proposition.',
            'Do not drift into an adult sexual event even if the recent conversation contains sexual material.',
        ];
    const sceneContext = request.room
        ? `Location: ${request.room.scene.location}\nReality layer: ${request.room.scene.realityLayer}\nPresent member IDs: ${request.room.scene.presentMemberIds.join(', ')}\nCurrent summary: ${request.room.scene.summary}\nUnresolved: ${request.room.scene.unresolved.join('; ') || 'none'}`
        : 'Infer the live location, reality layer, participants and unfinished beat from the recent completed conversation. Do not contradict it.';
    const eventSystemPrompt = [
        options.contentMode === 'nsfw'
            ? 'You are the format director of one ready-to-begin interactive adult program inside a continuous private romance conversation.'
            : 'You design one fresh surprise-event card for a continuous private romance conversation.',
        'The card is a playable opening, not a complete short story: create an immediate hook, concrete situation and unresolved tension that can develop naturally over several chat turns.',
        'Build one causal chain that is easy to understand: what concretely happened, where it happened, why it matters now, how each selected participant became involved, and what decision remains for the user. Do not splice together unrelated random ideas.',
        'The active characters must remain recognizable and retain their established voice, nationality, occupation, public identity, memories and current relationship progress.',
        'For a singer, idol, actor or other public performer, strongly prefer identity-specific inspiration when fresh: backstage timing, rehearsal, recording, award events, travel schedules, members or staff, public-versus-private tension, secret rest time, or a performance-related surprise. Keep all private developments explicitly inside this fictional conversation and never present invented claims as real news.',
        'Vary scale and mood. Events may be tender, funny, awkward, dramatic, mysterious, romantically charged or adult according to established context, but must not sanitize the current relationship or force an intensity unsupported by it.',
        'A surprise must contain one specific catalyst that changes the current moment: an interruption, deadline, discovery, secret, mistake, invitation, public/private conflict, unexpected person, or emotionally risky choice.',
        'Reject routine waking up, ordinary meals, generic dates, generic rain, merely discussing an existing plan, or “they spend time together” unless a genuinely new concrete twist transforms it.',
        'Never puppet the user, decide the user agrees, resolve the central tension, skip directly to the ending, reset the current relationship, or replay a completed scene.',
        'An event may include a clearly attributed staff member, friend, fan, manager or other NPC when useful, but do not silently turn an NPC into a fixed room member.',
        'The opening_instruction is hidden from the user. It must tell the chat model exactly how to begin the event in character while preserving current location, clothing, positions and reality layer unless the event itself naturally initiates a transition.',
        'Write title, hook, setup, activities, user_choice and opening_instruction in natural Traditional Chinese. Return only the requested JSON.',
        ...contentModeRules,
        `SELECTED PARTICIPANTS (fixed by the app): ${participants.map(participant => participant.name).join(', ')}. Include every one of them in the same event. Do not return participant IDs or hidden member-role data; the app supplies those locally.`,
        'activities must contain 3 to 5 different concrete activities in execution order. Every item must name an observable action, who acts or how participants rotate, any card/prop/timer/pairing involved, and how that item ends.',
        'Never use “adult challenge”, “sexual challenge”, “intimate interaction”, “something exciting”, “different activity” or similar labels as a complete activity. Those are categories, not descriptions. State the actual game mechanic and action.',
        'user_choice must be one clear unresolved decision the user can answer immediately. It must not assume consent or narrate the user’s action.',
        'Unselected fixed room members must not speak, act, or become part of this event card.',
        'OUTPUT CONTRACT: return one JSON object only, with exactly these keys and no Markdown: {"title":"...","category":"...","intensity":"gentle|playful|dramatic|heated","hook":"...","setup":"...","opening_instruction":"...","activities":["...","...","..."],"user_choice":"...","relationship_effect":{"closeness":2,"trust":1,"romantic_tension":3,"initiative":2}}.',
        `ALLOWED FRESH CATEGORIES: ${allowedCategories.join(', ')}. Choose exactly one category from this list.`,
        options.contentMode === 'nsfw'
            ? 'The category is only a flavor tag. The interactive adult-show format and first round take priority over category logistics.'
            : `CATEGORY PROOF REQUIREMENTS:\n${allowedCategoryProof}\nThe setup must visibly contain the proof for the chosen category.`,
        `CURRENT SCENE:\n${sceneContext}`,
        `FIXED CHARACTER FILES:\n${identityLedger}`,
        `RECENT EVENT CARDS THAT MUST NOT BE REPEATED OR MERELY RENAMED:\n${recentEventLedger}`,
    ].join('\n\n');

    const models = buildSurpriseEventModelRoute(dependencies.chatModelSettings);
    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        dependencies.setRuntimeState(
            index === 0 ? 'generating' : 'retrying',
            index === 0 ? '正在抽取驚喜事件...' : '正在換一種靈感...',
        );
        try {
            const resultText = await dependencies.runModel({
                model,
                messages: [
                    { role: 'system', content: eventSystemPrompt },
                    ...dependencies.recentMessages,
                    {
                        role: 'user',
                        content: `Create exactly one ${options.contentMode === 'nsfw' ? 'ready-to-start interactive 18+ / NSFW show' : 'non-sexual event card'} now for all selected participants. Do not continue the conversation itself.`,
                    },
                ],
                temperature: 0.78,
                topP: 0.9,
                repetitionPenalty: 1.12,
                responseFormat: /venice-uncensored-1-2/iu.test(model)
                    ? eventEngine.SURPRISE_EVENT_RESPONSE_FORMAT
                    : undefined,
                signal: request.signal,
            }, dependencies.timeoutMs);
            const draft = eventEngine.parseSurpriseEventProposal(resultText, validMemberIds, fallbackMemberId);
            if (draft) {
                draft.involvedMemberIds = [...validMemberIds];
                if (!allowedCategories.includes(draft.category)) draft.category = fallbackCategory;
                if (options.contentMode === 'nsfw') {
                    if (!/^18\+/iu.test(draft.title)) draft.title = `18+ 節目：${draft.title}`;
                    if (!eventEngine.surpriseEventHasSpecificActivities(draft)) {
                        draft.activities = [...nsfwDirection.showActivities];
                    }
                    draft.memberRoles = eventEngine.buildFallbackSurpriseShowMemberRoles(participants);
                    draft.userChoice = draft.userChoice || nsfwDirection.showChoice;
                } else {
                    draft.memberRoles = eventEngine.buildFallbackSurpriseEventMemberRoles(participants, draft.category);
                    draft.userChoice = draft.userChoice || (participants.length > 1
                        ? '你要先回應哪一位的第一步？'
                        : `你要接受 ${participants[0].name} 的第一步，還是要求她改變安排？`);
                }
            }
            const draftParticipantIds = new Set(draft?.involvedMemberIds || []);
            const hasExactParticipants = draftParticipantIds.size === validMemberIds.length
                && validMemberIds.every(id => draftParticipantIds.has(id));
            if (
                !draft
                || !hasExactParticipants
                || !allowedCategories.includes(draft.category)
                || (options.contentMode !== 'nsfw' && !eventEngine.surpriseEventMatchesCategory(draft))
                || !eventEngine.surpriseEventMatchesContentMode(draft, options.contentMode)
                || !eventEngine.surpriseEventHasPlayableStructure(draft, validMemberIds)
                || (options.contentMode === 'nsfw' && !eventEngine.surpriseEventReadsLikeInteractiveShow(draft))
                || (options.contentMode === 'nsfw' && !eventEngine.surpriseEventHasSpecificActivities(draft))
                || recentEvents.some(previous => eventEngine.surpriseEventsAreTooSimilar(previous, draft))
            ) {
                throw new Error(`Repeated or invalid surprise event from ${model}.`);
            }
            draft.title = dependencies.normalizeText(draft.title);
            draft.hook = dependencies.normalizeText(draft.hook);
            draft.setup = dependencies.normalizeText(draft.setup);
            draft.openingInstruction = dependencies.normalizeText(draft.openingInstruction);
            draft.memberRoles = draft.memberRoles?.map(role => ({
                ...role,
                objective: dependencies.normalizeText(role.objective),
                firstMove: dependencies.normalizeText(role.firstMove),
            }));
            if (draft.userChoice) draft.userChoice = dependencies.normalizeText(draft.userChoice);
            draft.activities = draft.activities?.map(dependencies.normalizeText);
            return {
                ...draft,
                contentMode: options.contentMode,
                id: crypto.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                status: 'pending',
                createdAt: Date.now(),
            };
        } catch (error) {
            if (dependencies.isAbortError(error)) throw error;
            console.warn('[aigf4 surprise event attempt rejected]', {
                requestId: request.id,
                model,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const fallback = eventEngine.createFallbackSurpriseEvent(
        request.persona,
        fallbackMemberId,
        recentEvents.map(event => event.category),
        fallbackCategory,
        validMemberIds,
    );
    const memberRoles = options.contentMode === 'nsfw'
        ? eventEngine.buildFallbackSurpriseShowMemberRoles(participants)
        : eventEngine.buildFallbackSurpriseEventMemberRoles(participants, fallback.category);
    const userChoice = participants.length > 1
        ? '你要先回應哪一位的第一步，還是要求她們重新協調安排？'
        : `你要接受 ${participants[0].name} 的第一步、拒絕，還是要求她改變安排？`;
    const modeAwareFallback = options.contentMode === 'nsfw'
        ? {
            ...fallback,
            title: `18+ 節目：${nsfwDirection.showTitle}`,
            hook: nsfwDirection.showHook,
            setup: `${participants.map(participant => participant.name).join('、')} 全部是本節目的正式參與者。${nsfwDirection.showSetup} ${nsfwDirection.fallbackPremise}`,
            openingInstruction: `直接以正在進行的 18+ 互動節目第一回合開場，不要再討論籌備、行程、路線或是否舉辦。${nsfwDirection.fallbackPremise} 讓每位已選角色依照隱藏分工立即說話及行動，彼此互動後停在使用者的第一個選擇，不要替使用者答應或一次完成整個節目。`,
            intensity: 'heated' as const,
            involvedMemberIds: validMemberIds,
            memberRoles,
            activities: [...nsfwDirection.showActivities],
            userChoice: nsfwDirection.showChoice,
            relationshipEffect: {
                ...fallback.relationshipEffect,
                romanticTension: Math.max(5, fallback.relationshipEffect.romanticTension),
                initiative: Math.max(3, fallback.relationshipEffect.initiative),
            },
        }
        : {
            ...fallback,
            involvedMemberIds: validMemberIds,
            memberRoles,
            activities: memberRoles.slice(0, 3).map(role => role.firstMove),
            userChoice,
            setup: fallback.setup,
            openingInstruction: `${fallback.openingInstruction} 依照每人的指定第一步開始，停在使用者尚未作出的選擇。本事件必須保持非 18+。`,
        };
    return {
        ...modeAwareFallback,
        contentMode: options.contentMode,
        id: crypto.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending',
        createdAt: Date.now(),
    };
};
