/** Venice AI's independent conversation keys and cloud-syncable titles. */
export const ASSISTANT_TOPIC_PREFIX = 'venice-ai-topic-';
export const ASSISTANT_TOPICS_SETTING_KEY = 'veniceAssistantTopicsV1';
export type AssistantTopicTitles = Record<string, string>;

export const isAssistantConversationKey = (key: string | null, assistantKey: string): boolean =>
    Boolean(key && (key === assistantKey || /^venice-ai-topic-[a-z0-9-]+$/i.test(key)));

export const normalizeAssistantTopicTitle = (value: string): string =>
    value.replace(/\s+/gu, ' ').trim().slice(0, 70);

export const parseAssistantTopicTitles = (raw: string | null): AssistantTopicTitles => {
    if (!raw || raw.length > 150_000) return {};
    try {
        const data: unknown = JSON.parse(raw);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
        const titles: AssistantTopicTitles = Object.create(null);
        for (const [key, name] of Object.entries(data)) {
            if (!/^venice-ai-topic-[a-z0-9-]+$/i.test(key) || typeof name !== 'string') continue;
            titles[key] = normalizeAssistantTopicTitle(name) || '新對話';
        }
        return titles;
    } catch {
        return {};
    }
};

export const getAssistantTopicTitle = (
    key: string,
    assistantKey: string,
    names: AssistantTopicTitles,
    firstMessage?: string,
): string => key === assistantKey
    ? '原有對話'
    : names[key] || normalizeAssistantTopicTitle(firstMessage || '').slice(0, 36) || '新對話';

export const listAssistantConversationKeys = (
    historyKeys: string[],
    names: AssistantTopicTitles,
    assistantKey: string,
): string[] => {
    const keys = new Set<string>([assistantKey]);
    for (const key of historyKeys) if (isAssistantConversationKey(key, assistantKey)) keys.add(key);
    for (const key of Object.keys(names)) if (isAssistantConversationKey(key, assistantKey)) keys.add(key);
    return [...keys];
};
