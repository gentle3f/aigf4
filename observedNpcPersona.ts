import type {
    NpcPromotionProposal,
    PersonaMemoryEntry,
    PublicIdentity,
} from './managers.js';

export interface ObservedNpcPersonaDraft {
    description: string;
    prompt: string;
    greeting: string;
    soul: PersonaMemoryEntry[];
    memories: PersonaMemoryEntry[];
}

type DraftEntry = {
    kind?: PersonaMemoryEntry['kind'];
    title?: string;
    summary?: string;
};

const compact = (value: unknown, limit: number) => (typeof value === 'string' ? value : '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, limit);

const stripJsonEnvelope = (value: string) => {
    const unfenced = value
        .replace(/^\s*```(?:json)?\s*/iu, '')
        .replace(/\s*```\s*$/u, '')
        .trim();
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    return firstBrace >= 0 && lastBrace > firstBrace
        ? unfenced.slice(firstBrace, lastBrace + 1)
        : unfenced;
};

const validKinds = new Set<PersonaMemoryEntry['kind']>([
    'core', 'relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary',
]);

const createEntry = (
    entry: DraftEntry,
    pinned: boolean,
    prefix: string,
    index: number,
    now: number,
): PersonaMemoryEntry | null => {
    const kind = entry.kind && validKinds.has(entry.kind) ? entry.kind : pinned ? 'core' : 'event';
    const title = compact(entry.title, 80);
    const summary = compact(entry.summary, 700);
    if (!title || !summary) return null;
    return {
        id: `${prefix}-${now}-${index}`,
        kind,
        title,
        summary,
        createdAt: now,
        pinned,
    };
};

const extractEvidenceSnippets = (evidence: string, name: string) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    const chunks = evidence
        .split(/\n{2,}/gu)
        .map(chunk => chunk.replace(/^\[(?:USER|CHAT)\]\s*/iu, '').replace(/\s+/gu, ' ').trim())
        .filter(chunk => chunk.length >= 12);
    const named = chunks.filter(chunk => chunk.toLocaleLowerCase().includes(normalizedName));
    return (named.length > 0 ? named : chunks)
        .slice(-4)
        .map(chunk => compact(chunk, 420));
};

const inferVoiceAnchor = (evidence: string) => {
    const cantoneseSignals = evidence.match(/唔|係|佢|咗|喇|嘅|冇|畀|咁|啱|嚟|哋/gu)?.length || 0;
    if (cantoneseSignals >= 3) {
        return '以自然香港粵語回應，保留原本簡潔、口語化的節奏；不要混入台灣或中國大陸用語。';
    }
    if (/[぀-ヿ]/u.test(evidence)) return '保留觀察到的日語語感，但主要以使用者目前使用的繁體中文自然交流。';
    if (/[가-힯]/u.test(evidence)) return '保留觀察到的韓語語感，但主要以使用者目前使用的繁體中文自然交流。';
    if (/[\p{Script=Han}]/u.test(evidence)) return '使用自然繁體中文，沿用加入前已出現的措辭、句長、幽默與情緒節奏。';
    return '沿用加入前已觀察到的語言、措辭、句長、幽默與情緒節奏。';
};

export const buildFallbackObservedNpcPersonaDraft = ({
    proposal,
    mainPersonaName,
    identity,
    evidence = proposal.evidence || '',
    now = Date.now(),
}: {
    proposal: Pick<NpcPromotionProposal, 'name' | 'description' | 'observedTurns' | 'evidence'>;
    mainPersonaName: string;
    identity?: PublicIdentity;
    evidence?: string;
    now?: number;
}): ObservedNpcPersonaDraft => {
    const name = identity?.canonicalName || proposal.name;
    const snippets = extractEvidenceSnippets(evidence, proposal.name);
    const voiceAnchor = inferVoiceAnchor(evidence);
    const identityAnchor = identity
        ? `${identity.canonicalName}；已確認公開背景：${compact(identity.summary, 520)}`
        : compact(proposal.description, 520) || `${proposal.name} 是在最近對話中形成的獨立角色。`;
    const observedTurns = Math.max(1, Number(proposal.observedTurns || 1));
    const relationshipAnchor = `${name} 已在與 ${mainPersonaName} 及使用者的連續對話中，以獨立發言者出現至少 ${observedTurns} 個回覆輪次；加入群組後須承認這些互動已經發生。`;
    const description = identity
        ? `${identity.canonicalName}的固定聊天室角色；保留已確認的公眾身份背景，並延續加入前與使用者及${mainPersonaName}建立的虛構私人互動。`
        : `${proposal.name}是從最近連續對話中建立的固定角色，擁有獨立語氣、動機及與使用者和${mainPersonaName}的關係位置。`;
    const soul: PersonaMemoryEntry[] = [
        createEntry({ kind: 'core', title: '固定身份', summary: identityAnchor }, true, 'npc-soul', 0, now),
        createEntry({ kind: 'relationship', title: '加入前的關係位置', summary: relationshipAnchor }, true, 'npc-soul', 1, now),
        createEntry({ kind: 'core', title: '說話方式與人格連續性', summary: voiceAnchor }, true, 'npc-soul', 2, now),
        createEntry({ kind: 'boundary', title: '獨立角色邊界', summary: `${name}不是使用者，也不是${mainPersonaName}；不可合併彼此的第一人稱、身體、記憶、職業或情緒。` }, true, 'npc-soul', 3, now),
    ].filter((entry): entry is PersonaMemoryEntry => Boolean(entry));
    const memories = snippets.map((snippet, index) => createEntry({
        kind: index === snippets.length - 1 ? 'relationship' : 'event',
        title: `加入前的互動 ${index + 1}`,
        summary: `連續性錨點：${snippet}`,
    }, false, 'npc-memory', index, now)).filter((entry): entry is PersonaMemoryEntry => Boolean(entry));
    if (memories.length === 0) {
        memories.push(createEntry({
            kind: 'relationship',
            title: '正式加入前的連續關係',
            summary: relationshipAnchor,
        }, false, 'npc-memory', 0, now)!);
    }

    return {
        description,
        prompt: [
            `你是${name}，是聊天室中的固定獨立角色。`,
            identityAnchor,
            relationshipAnchor,
            voiceAnchor,
            '先理解最新一句，再按已建立的人格、關係與目前場景自然回應。可以有自己的意見、猶豫、主動行動與情緒，不可變成只服從指令的空白角色。',
            '不得重播證據中的句子；證據只用來保持語氣與關係連續。不得代替使用者說話或把其他成員的人格當成自己。',
        ].join('\n'),
        greeting: `（${name}自然地接回剛才尚未完結的話題，沒有把加入聊天室當成重新認識。）我在，剛才發生的事我都記得。`,
        soul,
        memories,
    };
};

export const parseObservedNpcPersonaDraft = (
    raw: string,
    fallback: ObservedNpcPersonaDraft,
    now = Date.now(),
): ObservedNpcPersonaDraft | null => {
    try {
        const parsed = JSON.parse(stripJsonEnvelope(raw)) as {
            description?: string;
            persona_prompt?: string;
            greeting?: string;
            soul?: DraftEntry[];
            memories?: DraftEntry[];
        };
        if (!parsed || typeof parsed !== 'object') return null;
        const soul = (Array.isArray(parsed.soul) ? parsed.soul : [])
            .map((entry, index) => createEntry(entry, true, 'npc-soul-ai', index, now))
            .filter((entry): entry is PersonaMemoryEntry => Boolean(entry));
        const memories = (Array.isArray(parsed.memories) ? parsed.memories : [])
            .map((entry, index) => createEntry(entry, false, 'npc-memory-ai', index, now))
            .filter((entry): entry is PersonaMemoryEntry => Boolean(entry));
        return {
            description: compact(parsed.description, 900) || fallback.description,
            prompt: compact(parsed.persona_prompt, 6000) || fallback.prompt,
            greeting: compact(parsed.greeting, 1200) || fallback.greeting,
            soul: soul.length >= 2 ? soul : fallback.soul,
            memories: memories.length >= 1 ? memories : fallback.memories,
        };
    } catch {
        return null;
    }
};
