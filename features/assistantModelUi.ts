import {
    listVeniceTextModels,
    VENICE_AUTH_REQUIRED_ERROR,
} from '../venice.js';
import type { VeniceModelSummary } from '../venice.js';

export type AssistantModelUiDependencies = {
    preferredModelId: string;
    getSelectedModelId: () => string;
    setSelectedModelId: (modelId: string) => void;
    getFallbackModelIds: () => string[];
    isRequestActive: () => boolean;
    handleAuthRequired: () => void;
    onModelsUpdated: () => void;
};

export type AssistantModelUiHandle = {
    show: () => void;
    hide: () => void;
    setBusy: (busy: boolean) => void;
    loadModels: (force?: boolean) => Promise<void>;
    getModels: () => VeniceModelSummary[];
    getModelListState: () => {
        loading: boolean;
        usesFallback: boolean;
        updatedAt: number | null;
    };
    formatContextSize: (tokens?: number) => string;
};

const assistantModelBar = document.getElementById('assistant-model-bar')!;
const assistantModelSelect = document.getElementById('assistant-model-select') as HTMLSelectElement;
const assistantModelMeta = document.getElementById('assistant-model-meta')!;
const refreshAssistantModelsBtn = document.getElementById('refresh-assistant-models') as HTMLButtonElement;

let dependencies: AssistantModelUiDependencies | null = null;
let listenersReady = false;
let models: VeniceModelSummary[] = [];
let modelsPromise: Promise<void> | null = null;
let usesFallback = false;
let updatedAt: number | null = null;
let busy = false;

const getDependencies = () => {
    if (!dependencies) throw new Error('Assistant Model UI dependencies are not initialized.');
    return dependencies;
};

export const formatAssistantContextSize = (tokens?: number) => {
    if (!tokens || tokens <= 0) return '';
    if (tokens >= 1_000_000) {
        return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M context`;
    }
    return `${Math.round(tokens / 1000)}K context`;
};

const formatModelPrice = (value?: number) => {
    if (typeof value !== 'number') return '?';
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
};

const buildFallbackModels = (): VeniceModelSummary[] => Array.from(new Set(
    getDependencies().getFallbackModelIds().filter(Boolean),
)).map(id => ({
    id,
    name: id,
    description: '本機設定中的 Venice 模型',
    privacy: 'unknown',
    traits: [],
    uncensored: /uncensored|heretic|dolphin|role[ -]?play/i.test(id),
}));

const updateMeta = () => {
    const selectedModelId = getDependencies().getSelectedModelId();
    const model = models.find(item => item.id === selectedModelId);
    if (!model) {
        assistantModelMeta.textContent = `目前模型：${selectedModelId}`;
        return;
    }

    const details = [
        model.uncensored ? '自由模型' : '',
        formatAssistantContextSize(model.contextTokens),
        model.privacy !== 'unknown' ? model.privacy : '',
        `輸入 $${formatModelPrice(model.inputUsd)} / 輸出 $${formatModelPrice(model.outputUsd)}（每百萬 token）`,
    ].filter(Boolean);
    assistantModelMeta.textContent = details.join(' · ');
};

const refreshDisabledState = () => {
    const requestActive = getDependencies().isRequestActive();
    assistantModelSelect.disabled = busy || requestActive || modelsPromise !== null || models.length === 0;
    refreshAssistantModelsBtn.disabled = busy || requestActive || modelsPromise !== null;
};

const renderOptions = () => {
    assistantModelSelect.innerHTML = '';
    const sortedModels = [...models].sort((left, right) => {
        if (left.uncensored !== right.uncensored) return left.uncensored ? -1 : 1;
        if (left.privacy !== right.privacy) return left.privacy === 'private' ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hant');
    });

    const deps = getDependencies();
    let selectedModelId = deps.getSelectedModelId();
    if (!sortedModels.some(model => model.id === selectedModelId)) {
        const preferred = sortedModels.find(model => model.id === deps.preferredModelId)
            || sortedModels.find(model => model.uncensored)
            || sortedModels[0];
        if (preferred) {
            selectedModelId = preferred.id;
            deps.setSelectedModelId(selectedModelId);
        }
    }

    const groups = [
        { label: '自由／角色扮演模型', models: sortedModels.filter(model => model.uncensored) },
        { label: '私人模型', models: sortedModels.filter(model => !model.uncensored && model.privacy === 'private') },
        { label: '其他文字模型', models: sortedModels.filter(model => !model.uncensored && model.privacy !== 'private') },
    ];

    groups.forEach(group => {
        if (group.models.length === 0) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            const context = formatAssistantContextSize(model.contextTokens);
            option.textContent = `${model.name}${context ? ` · ${context}` : ''} · $${formatModelPrice(model.inputUsd)}/$${formatModelPrice(model.outputUsd)}`;
            optgroup.appendChild(option);
        });
        assistantModelSelect.appendChild(optgroup);
    });

    assistantModelSelect.value = selectedModelId;
    refreshDisabledState();
    updateMeta();
};

const loadModels = async (force = false) => {
    if (modelsPromise) return modelsPromise;
    if (!force && models.length > 0) {
        renderOptions();
        return;
    }

    assistantModelMeta.textContent = '正在讀取 Venice 可用模型...';
    refreshDisabledState();

    modelsPromise = (async () => {
        try {
            models = await listVeniceTextModels(force);
            if (models.length === 0) throw new Error('沒有可用的文字模型。');
            usesFallback = false;
            updatedAt = Date.now();
        } catch (error) {
            console.warn('Unable to load Venice models; using configured fallback list.', error);
            models = buildFallbackModels();
            usesFallback = true;
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
                getDependencies().handleAuthRequired();
            }
        } finally {
            modelsPromise = null;
            renderOptions();
            getDependencies().onModelsUpdated();
        }
    })();

    return modelsPromise;
};

const setupListeners = () => {
    if (listenersReady) return;
    listenersReady = true;

    assistantModelSelect.addEventListener('change', () => {
        if (!assistantModelSelect.value || getDependencies().isRequestActive()) return;
        getDependencies().setSelectedModelId(assistantModelSelect.value);
        updateMeta();
    });
    refreshAssistantModelsBtn.addEventListener('click', () => {
        void loadModels(true);
    });
};

export const createAssistantModelUi = (
    nextDependencies: AssistantModelUiDependencies,
): AssistantModelUiHandle => {
    dependencies = nextDependencies;
    setupListeners();

    return {
        show: () => {
            assistantModelBar.classList.remove('hidden');
            void loadModels();
        },
        hide: () => {
            assistantModelBar.classList.add('hidden');
        },
        setBusy: nextBusy => {
            busy = nextBusy;
            refreshDisabledState();
        },
        loadModels,
        getModels: () => models,
        getModelListState: () => ({
            loading: modelsPromise !== null,
            usesFallback,
            updatedAt,
        }),
        formatContextSize: formatAssistantContextSize,
    };
};
