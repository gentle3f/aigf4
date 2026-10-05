import {
    defaultChatPreferences,
    type ChatPreferences,
} from '../chatExperience.js';
import type { VeniceMessage } from '../venice.js';

export function parseExperienceSuggestions(raw: string): string[] {
    const unfenced = raw.replace(/^\s*```(?:json)?\s*/iu, '').replace(/\s*```\s*$/u, '').trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
    try {
        const data = JSON.parse(candidate) as { suggestions?: unknown };
        if (
            Array.isArray(data.suggestions)
            && data.suggestions.length === 3
            && data.suggestions.every(value => typeof value === 'string' && value.trim())
        ) {
            return data.suggestions.map(value => value.trim());
        }
    } catch {
        // Never surface a raw JSON parser exception to the chat UI.
    }
    throw new Error('未能整理接戲建議，請再試一次。');
}

export function experienceDialog(title: string) {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'border:0;border-radius:20px;padding:24px;width:min(92vw,560px);max-height:85dvh;overflow:auto;background:#f6faf8;color:#163d35;box-shadow:0 12px 60px #0005';
    const heading = document.createElement('h2');
    heading.textContent = title;
    heading.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:16px';
    const close = document.createElement('button');
    close.textContent = '關閉';
    close.style.cssText = 'float:right;padding:8px';
    close.onclick = () => dialog.close();
    dialog.append(close, heading);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
}

export function experienceButton(label: string, action: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'display:block;width:100%;padding:12px;margin:10px 0;border:1px solid #a5cfc2;border-radius:12px;text-align:left;background:#fff;white-space:pre-wrap';
    button.onclick = action;
    return button;
}

export function editChatPreferences(current: ChatPreferences | undefined, save: (value: ChatPreferences) => void) {
    const dialog = experienceDialog('聊天室互動偏好');
    const values = { ...defaultChatPreferences, ...current };
    const fields = [
        ['length', '回覆長度', [['natural', '自然'], ['detailed', '細膩豐富'], ['concise', '簡潔']]],
        ['style', '描寫比例', [['balanced', '對白與描寫平衡'], ['dialogue', '多些對白'], ['descriptive', '多些動作及環境']]],
        ['pace', '推進節奏', [['natural', '自然'], ['slow', '慢慢發展'], ['active', '角色更主動']]],
    ] as const;
    fields.forEach(([key, caption, options]) => {
        const label = document.createElement('label');
        label.textContent = caption;
        const select = document.createElement('select');
        select.style.cssText = 'display:block;width:100%;padding:12px;margin:8px 0 18px;background:white;color:#163d35';
        options.forEach(([value, text]) => select.add(new Option(text, value)));
        select.value = values[key];
        select.onchange = () => { Object.assign(values, { [key]: select.value }); };
        label.append(select);
        dialog.append(label);
    });
    dialog.append(experienceButton('儲存偏好', () => { save(values); dialog.close(); }));
}


export interface ExperienceDraftModelRequest {
    model: string;
    messages: VeniceMessage[];
    temperature: number;
    signal: AbortSignal;
}

export interface ExperienceDraftGenerationOptions {
    direct: boolean;
    isGroup: boolean;
    model: string;
    context: VeniceMessage[];
    instruction: string;
    rewriteSystemPrompt?: string;
    signal: AbortSignal;
    runModel: (request: ExperienceDraftModelRequest) => Promise<string>;
}

export type ExperienceDraftGenerationResult =
    | { kind: 'suggestions'; suggestions: string[] }
    | { kind: 'rewrite'; text: string };

export async function generateExperienceDraft(
    options: ExperienceDraftGenerationOptions,
): Promise<ExperienceDraftGenerationResult> {
    const systemPrompt = options.direct
        ? [
            options.rewriteSystemPrompt || '',
            'Editing task: rewrite only the last assistant reply. Preserve every event, fact, outfit, participant and outcome. Change presentation only. Return the same chat envelope for a group, or plain prose for a single chat.',
        ].filter(Boolean).join('\n\n')
        : [
            'You suggest the next message for the USER in an ongoing private roleplay conversation.',
            options.isGroup
                ? 'This is a group conversation. Respect the existing participants and scene supplied in the history.'
                : 'This is a one-to-one conversation. Respect the existing character and scene supplied in the history.',
            'Return only valid JSON: {"suggestions":["...","...","..."]}. Give exactly three distinct short messages the USER could send next: dialogue, action, or gentle development. Match the user language. Respect current scene and do not invent past facts. Do not continue as a character. Never return <chat>, <scene>, <npc_candidate>, XML, or prose outside the JSON object.',
        ].join('\n\n');

    const resultText = await options.runModel({
        model: options.model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...options.context,
            { role: 'user', content: options.instruction },
        ],
        temperature: 0.7,
        signal: options.signal,
    });

    return options.direct
        ? { kind: 'rewrite', text: resultText }
        : { kind: 'suggestions', suggestions: parseExperienceSuggestions(resultText) };
}
