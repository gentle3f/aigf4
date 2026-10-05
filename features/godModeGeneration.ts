import type { Persona } from '../managers.js';
import {
    extractPersonaUpdatePayload,
    type VeniceMessage,
} from '../venice.js';

export interface GodModeGenerationRequest {
    id: number;
    mode: string;
    startedAt: number;
    persona: Persona;
    signal: AbortSignal;
}

export interface GodModeTransportResult {
    text: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    finishReason?: string;
}

export interface GodModeGenerationDependencies {
    models: string[];
    recentMessages: VeniceMessage[];
    soulMemory: string;
    episodicMemory: string;
    setRuntimeState: (state: 'generating' | 'retrying', detail: string) => void;
    runModel: (request: {
        model: string;
        messages: VeniceMessage[];
        maxCompletionTokens: number;
        temperature: number;
        topP: number;
        repetitionPenalty: number;
        signal: AbortSignal;
    }) => Promise<GodModeTransportResult>;
    isAbortError: (error: unknown) => boolean;
}

const buildGodModeSystemPrompt = (
    persona: Persona,
    soulMemory: string,
    episodicMemory: string,
) => {
    const sections = [
        'You are editing the CURRENT active character persona for a romance chat app.',
        `Current character name: ${persona.name}`,
        `Current full persona prompt:\n${persona.prompt}`,
        soulMemory ? `Current soul.md:\n${soulMemory}` : '',
        episodicMemory ? `Current memory.md:\n${episodicMemory}` : '',
        'Task:\n- Modify only the current character persona.\n- Keep the same character identity.\n- Do not switch to another persona, profession, species, or assistant role.\n- Output only the added personality adjustments, not a full rewrite.',
        `Identity that must stay unchanged:\n- Character name must stay exactly: ${persona.name}`,
        'Output rules:\n- Reply in Traditional Chinese.\n- First output exactly one short confirmation sentence.\n- Then output exactly one tag on a new line: [PERSONA_UPDATE: <only the added personality adjustments>]\n- The tag content must be 1 to 3 short sentences about new traits only.\n- Do not use first-person self-introduction such as「我是一個...」.\n- Do not output JSON.\n- Do not output markdown headings.\n- Do not output code fences.\n- Do not output any other tags.',
    ];
    return sections.filter(Boolean).join('\n\n');
};

export const runGodModeGeneration = async (
    request: GodModeGenerationRequest,
    latestUserInstruction: string,
    dependencies: GodModeGenerationDependencies,
): Promise<{ visibleText: string; personaUpdate: string | null }> => {
    const models = Array.from(new Set(dependencies.models.filter(Boolean)));
    let lastError: Error | null = null;

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const detail = index === 0 ? '調整人格中...' : '重新整理人格設定中...';
        dependencies.setRuntimeState(index === 0 ? 'generating' : 'retrying', detail);

        try {
            const result = await dependencies.runModel({
                model,
                messages: [
                    {
                        role: 'system',
                        content: buildGodModeSystemPrompt(
                            request.persona,
                            dependencies.soulMemory,
                            dependencies.episodicMemory,
                        ),
                    },
                    ...dependencies.recentMessages,
                    { role: 'user', content: latestUserInstruction },
                ],
                maxCompletionTokens: 180,
                temperature: 0.25,
                topP: 0.9,
                repetitionPenalty: 1.04,
                signal: request.signal,
            });

            console.info('[aigf4 generation]', {
                requestId: request.id,
                mode: request.mode,
                phase: index === 0 ? 'primary' : 'fallback',
                model: result.model,
                latencyMs: Math.round(performance.now() - request.startedAt),
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                finishReason: result.finishReason,
            });

            const parsed = extractPersonaUpdatePayload(result.text);
            if (!parsed.personaUpdate) {
                throw new Error(`No PERSONA_UPDATE returned from ${model}.`);
            }
            return parsed;
        } catch (error) {
            if (dependencies.isAbortError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('God Mode could not return a valid PERSONA_UPDATE.');
};
