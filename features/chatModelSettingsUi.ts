import {
    buildCharacterModelRoute,
    buildStrictReviewModelRoute,
    CHAT_MODEL_SETTINGS_STORAGE_KEY,
    normalizeChatModelSettings,
} from '../chatModelSettings.js';
import type { ChatModelSettings } from '../chatModelSettings.js';
import type { VeniceModelSummary } from '../venice.js';
import { setPersistedAppSetting } from '../appSettings.js';

export type ChatModelSettingsUiHandle = {
    open: (scope: 'global' | 'cc') => void;
    refresh: () => void;
};

export type ChatModelSettingsUiDependencies = {
    getSettings: () => ChatModelSettings;
    applySettings: (settings: ChatModelSettings) => void;
    getDefaults: () => ChatModelSettings;
    getModels: () => VeniceModelSummary[];
    getModelListState: () => {
        loading: boolean;
        usesFallback: boolean;
        updatedAt: number | null;
    };
    loadModels: (force?: boolean) => Promise<void>;
    formatContextSize: (tokens?: number) => string;
    hideMenus: () => void;
};

const chatModelSettingsModal = document.getElementById('chat-model-settings-modal')!;
const closeChatModelSettingsBtn = document.getElementById('close-chat-model-settings') as HTMLButtonElement;
const chatModelSettingsTitle = document.getElementById('chat-model-settings-title')!;
const globalChatModelFields = document.getElementById('global-chat-model-fields')!;
const ccChatModelFields = document.getElementById('cc-chat-model-fields')!;
const chatPrimaryModelSelect = document.getElementById('chat-primary-model-select') as HTMLSelectElement;
const chatQualityModelSelect = document.getElementById('chat-quality-model-select') as HTMLSelectElement;
const chatEmergencyModelSelect = document.getElementById('chat-emergency-model-select') as HTMLSelectElement;
const ccPrimaryModelSelect = document.getElementById('cc-primary-model-select') as HTMLSelectElement;
const globalModelRoutePreview = document.getElementById('global-model-route-preview')!;
const ccModelRoutePreview = document.getElementById('cc-model-route-preview')!;
const chatModelListStatus = document.getElementById('chat-model-list-status')!;
const refreshChatModelsBtn = document.getElementById('refresh-chat-models') as HTMLButtonElement;
const resetChatModelSettingsBtn = document.getElementById('reset-chat-model-settings') as HTMLButtonElement;
const saveChatModelSettingsBtn = document.getElementById('save-chat-model-settings') as HTMLButtonElement;

export const createChatModelSettingsUi = (
    dependencies: ChatModelSettingsUiDependencies,
): ChatModelSettingsUiHandle => {
    const chatModelSelects = [
        chatPrimaryModelSelect,
        chatQualityModelSelect,
        chatEmergencyModelSelect,
        ccPrimaryModelSelect,
    ];
    let draft: ChatModelSettings = { ...dependencies.getSettings() };
    let scope: 'global' | 'cc' = 'global';

    const getChatModelOptionLabel = (model: VeniceModelSummary) => {
        const context = dependencies.formatContextSize(model.contextTokens);
        const identity = model.name === model.id ? model.id : `${model.name} · ${model.id}`;
        return `${identity}${context ? ` · ${context}` : ''}`;
    };

    const populateChatModelSelect = (select: HTMLSelectElement, selectedId: string) => {
        select.innerHTML = '';
        const sorted = [...dependencies.getModels()].sort((left, right) => {
            if (left.uncensored !== right.uncensored) return left.uncensored ? -1 : 1;
            return left.name.localeCompare(right.name, 'zh-Hant');
        });
        if (selectedId && !sorted.some(model => model.id === selectedId)) {
            const current = document.createElement('option');
            current.value = selectedId;
            current.textContent = `${selectedId} · 目前設定（Venice 清單未找到）`;
            select.appendChild(current);
        }
        sorted.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = getChatModelOptionLabel(model);
            select.appendChild(option);
        });
        select.value = selectedId;
        if (!select.value && select.options.length > 0) select.selectedIndex = 0;
    };

    const readDraftFromControls = () => normalizeChatModelSettings({
        primary: chatPrimaryModelSelect.value,
        qualityFallback: chatQualityModelSelect.value,
        emergencyFallback: chatEmergencyModelSelect.value,
        ccPrimary: ccPrimaryModelSelect.value,
    }, draft);

    const updateRoutePreviews = () => {
        draft = readDraftFromControls();
        globalModelRoutePreview.textContent = `實際次序：${buildCharacterModelRoute(draft, false).join(' → ')}。嚴格審查：${buildStrictReviewModelRoute(draft, false).join(' → ')}。`;
        ccModelRoutePreview.textContent = `Cc 實際次序：${buildCharacterModelRoute(draft, true).join(' → ')}。Cc 的生成及審查均先使用專用模型。`;
    };

    const render = () => {
        const modelState = dependencies.getModelListState();
        populateChatModelSelect(chatPrimaryModelSelect, draft.primary);
        populateChatModelSelect(chatQualityModelSelect, draft.qualityFallback);
        populateChatModelSelect(chatEmergencyModelSelect, draft.emergencyFallback);
        populateChatModelSelect(ccPrimaryModelSelect, draft.ccPrimary);
        chatModelSelects.forEach(select => { select.disabled = modelState.loading; });
        refreshChatModelsBtn.disabled = modelState.loading;
        updateRoutePreviews();
        if (modelState.usesFallback) {
            chatModelListStatus.textContent = '未能連接 Venice；目前顯示已保存及程式預設模型。';
        } else if (modelState.updatedAt) {
            chatModelListStatus.textContent = `已從 Venice 取得 ${dependencies.getModels().length} 個模型 · ${new Date(modelState.updatedAt).toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            chatModelListStatus.textContent = '正在讀取 Venice 模型清單...';
        }
    };

    const close = () => chatModelSettingsModal.classList.add('hidden');

    const open = (nextScope: 'global' | 'cc') => {
        scope = nextScope;
        draft = { ...dependencies.getSettings() };
        chatModelSettingsTitle.textContent = scope === 'cc' ? 'Cc 專用模型設定' : '聊天模型設定';
        globalChatModelFields.classList.toggle('hidden', scope === 'cc');
        ccChatModelFields.classList.remove('hidden');
        render();
        chatModelSettingsModal.classList.remove('hidden');
        dependencies.hideMenus();
        const load = dependencies.loadModels(false);
        render();
        void load.then(render);
    };

    closeChatModelSettingsBtn.addEventListener('click', close);
    chatModelSettingsModal.addEventListener('click', event => {
        if (event.target === chatModelSettingsModal) close();
    });
    chatModelSelects.forEach(select => select.addEventListener('change', updateRoutePreviews));
    refreshChatModelsBtn.addEventListener('click', () => {
        draft = readDraftFromControls();
        chatModelListStatus.textContent = '正在直接向 Venice 重新抓取模型清單...';
        void dependencies.loadModels(true).then(render);
    });
    resetChatModelSettingsBtn.addEventListener('click', () => {
        const defaults = dependencies.getDefaults();
        draft = scope === 'cc'
            ? { ...draft, ccPrimary: defaults.ccPrimary }
            : { ...defaults };
        render();
    });
    saveChatModelSettingsBtn.addEventListener('click', () => {
        draft = readDraftFromControls();
        const next = normalizeChatModelSettings(draft, dependencies.getDefaults());
        setPersistedAppSetting(CHAT_MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
        dependencies.applySettings(next);
        close();
    });

    return { open, refresh: render };
};
