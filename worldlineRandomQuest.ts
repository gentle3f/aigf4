import type { VeniceMessage } from './venice.js';
import type { WorldlineGenre } from './worldline.js';
import { worldlineGenreLabel } from './worldline.js';

export interface RandomMainQuestInput {
    title: string;
    genre: WorldlineGenre;
    premise: string;
    protagonist: string;
    goldenFinger: string;
    previousQuest?: string;
}

/** A writing brief, NOT a predetermined list of plots or random NPC names.
 * The model invents a new main arc conditioned on the player's actual world.
 */
export const buildRandomMainQuestMessages = (input: RandomMainQuestInput): VeniceMessage[] => [
    {
        role: 'system',
        content: [
            'You are an inventive serial web-novel story architect for a persistent interactive fiction world.',
            'Invent ONE original long-running MAIN STORY ARC in natural Traditional Chinese, around 160–360 Chinese characters.',
            'Include a gripping initial catalyst, a larger long-term objective, at least two independent forces with incompatible aims,',
            'a concealed complication, and meaningful potential consequences that can unfold over many chapters.',
            'The hero has creative freedom: do not railroad, prescribe their next dialogue, or force numbered choices.',
            'Respect the exact genre, protagonist and golden-finger power already chosen. Powers must have clever uses, not arbitrary nerfs.',
            'Make the plot feel distinctive to this world and avoid the generic "defeat demon king", tournament checklist,',
            'retrieve seven items, instantly become overpowered, or secret bloodline cliches unless naturally justified.',
            'The world can support romance and adult relationships as organically developing parallel storylines,',
            'but do not make the entire main quest a dating checklist or reduce people to collectable rewards.',
            'OUTPUT ONLY the story-arc synopsis as 1–3 coherent paragraphs. No markdown, no meta-commentary, no apology.',
        ].join(' '),
    },
    {
        role: 'user',
        content: [
            'Create a genuinely fresh plot, not a stock quest. Treat all of these as fixed user choices:',
            'World name: ' + input.title.slice(0,100),
            'Genre: ' + worldlineGenreLabel(input.genre),
            'Premise: ' + input.premise.slice(0,1400),
            'Protagonist: ' + input.protagonist.slice(0,300),
            'Golden finger / system: ' + input.goldenFinger.slice(0,650),
            input.previousQuest?.trim()
                ? 'Do NOT repeat or merely paraphrase the previous arc: ' + input.previousQuest.slice(0,440)
                : 'This is a fresh random roll: independently conceive the main driving conflict and first major turning point.',
        ].join('\n'),
    },
];

/** Reject model errors, markup, empty generations and truncated unusable arcs.
 * Do not silently replace a failed generation with one of a few fixed quests.
 */
export const normalizeRandomMainQuest = (raw: string): string => {
    if(typeof raw!=='string')throw new Error('主線生成沒有收到文字。');
    const result = raw
        .replace(/<think>[\s\S]*?<\/think>/giu,'')
        .replace(/^```(?:markdown|text|md)?\s*|\s*```$/giu,'')
        .replace(/\r/g,'')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,'')
        .replace(/^\s*(?:主線任務|主線劇情|故事主線|主線概述)\s*[:：]\s*/u,'')
        .trim();
    if(result.length<45 || /^(?:抱歉|我無法|對不起|Sorry|As an AI)/iu.test(result))
        throw new Error('模型未能生成可用嘅主線，請再抽一次。');
    // Worldline durable main-quest field has a deliberate 550-character limit.
    const clipped = Array.from(result).slice(0,520).join('').trim();
    if(clipped.length<45)throw new Error('生成結果過短。');
    return clipped;
};
