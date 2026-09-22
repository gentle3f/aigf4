export interface ChatPreferences {
    length: 'natural' | 'detailed' | 'concise';
    style: 'balanced' | 'dialogue' | 'descriptive';
    pace: 'natural' | 'slow' | 'active';
}

export const defaultChatPreferences: ChatPreferences = { length: 'natural', style: 'balanced', pace: 'natural' };

export function preferencePrompt(value?: ChatPreferences): string {
    if (!value) return '';
    return [
        'USER CHAT PREFERENCES: preserve continuity and character individuality while applying these preferences.',
        value.length === 'detailed' ? 'Give a developed, satisfying response with meaningful fresh detail, without padding or repeating.' : value.length === 'concise' ? 'Keep the response focused and concise.' : 'Use the length the current moment needs.',
        value.style === 'dialogue' ? 'Emphasize natural spoken exchanges.' : value.style === 'descriptive' ? 'Include concrete environment, expressions and actions relevant to the current moment.' : 'Balance dialogue with relevant action and environment.',
        value.pace === 'slow' ? 'Let the current beat breathe; do not rush time or resolve the scene immediately.' : value.pace === 'active' ? 'Let characters take one plausible initiative without deciding the user actions.' : 'Move forward at a natural pace.',
    ].join('\n');
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
