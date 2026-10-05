import type { Persona } from '../managers.js';

const PERSONA_INSPECT_PATTERNS = [
    /^show current persona$/i,
    /^show persona$/i,
    /^current persona$/i,
    /^show current setting$/i,
    /^顯示(?:目前|當前)?(?:角色)?人格(?:設定)?$/u,
    /^查看(?:目前|當前)?(?:角色)?人格(?:設定)?$/u,
    /^目前人格(?:設定)?$/u,
    /^當前人格(?:設定)?$/u,
];

export const isPersonaInspectCommand = (text: string) => {
    const normalized = text.trim();
    return PERSONA_INSPECT_PATTERNS.some(pattern => pattern.test(normalized));
};

export const formatPersonaDetails = (
    persona: Persona | null,
    soulMemory = '',
    episodicMemory = '',
) => {
    if (!persona) return '[系統] 目前沒有選中的角色。';

    const sections = [
        `目前角色：${persona.name}`,
        `角色簡述：${persona.description || '未設定'}`,
        `人格主設定：\n${persona.prompt || '未設定'}`,
        `開場語 / 語氣樣本：\n${persona.greeting || '未設定'}`,
    ];

    if (soulMemory) sections.push(`soul.md：\n${soulMemory}`);
    if (episodicMemory) sections.push(`memory.md：\n${episodicMemory}`);

    return sections.join('\n\n');
};
