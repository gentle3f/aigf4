export interface PromptComponentSize {
    name: string;
    chars: number;
    messages: number;
}

// Chinese-heavy prompts tokenise close to one token per two characters. This is
// an intentionally cheap estimate; Venice's returned prompt_tokens stays authoritative.
export const estimatePromptTokens = (chars: number) => Math.ceil(chars * 0.55);

export const promptComponent = (name: string, text: string, messages = 0): PromptComponentSize => ({
    name,
    chars: text.length,
    messages,
});

export const classifyCharacterSystemPrompt = (systemPrompt: string): PromptComponentSize[] => systemPrompt
    .split(/\n\n+/u)
    .filter(Boolean)
    .map(block => {
        const name = block.startsWith('Short identity:') || block.startsWith('Character identity') || block.startsWith('Voice reference')
            ? 'persona-definition'
            : block.startsWith('User-confirmed public identity') ? 'public-identity'
            : block.startsWith('soul.md') ? 'soul-memory'
            : block.startsWith('memory.md') ? 'episodic-memory'
            : block.startsWith('AUTHORITATIVE CURRENT WARDROBE') || block.startsWith('HIDDEN WARDROBE') ? 'wardrobe'
            : block.startsWith('Personality anchors:') ? 'behaviour-guidance'
            : block.startsWith('USER CHAT PREFERENCES:') ? 'response-preferences'
            : block.startsWith('Shared roleplay contract:') ? 'base-system'
            : block.startsWith('Speaker and participant ownership') || block.startsWith('Private continuity check') ? 'continuity-ownership'
            : block.startsWith('Natural reply rules:') || block.startsWith('Conversation priorities') ? 'response-quality'
            : block.startsWith('Internal continuity key:') ? 'internal-key'
            : block.startsWith('You are ') || /relationship/i.test(block) ? 'identity-relationship'
            : 'base-system';
        return promptComponent(name, block, 0);
    });

export const summarizePromptComponents = (components: PromptComponentSize[]) => ({
    chars: components.reduce((total, component) => total + component.chars, 0),
    messages: components.reduce((total, component) => total + component.messages, 0),
});
