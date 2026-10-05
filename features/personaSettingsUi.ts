import type { Persona, PublicIdentity } from '../managers.js';
import { normalizeFavoritePhotoPrompt } from '../photoPromptPreference.js';
import type { PublicIdentityResolution } from './publicIdentitySearch.js';

export type PersonaSettingsRoomTarget = { roomId: string; memberId: string } | null;

export type PersonaSettingsApplyInput = {
    personaKey: string;
    roomTarget: PersonaSettingsRoomTarget;
    updates: Partial<Persona>;
    previousGreeting: string;
    greeting: string;
    publicIdentityEnabled: boolean;
};

export type PersonaSettingsUiDependencies = {
    getCurrentPersona: () => Persona | null;
    getCurrentPersonaKey: () => string | null;
    resolvePublicIdentity: (query: string) => Promise<PublicIdentityResolution | null>;
    applySettings: (input: PersonaSettingsApplyInput) => void;
    requestAvatar: (target: PersonaSettingsRoomTarget, personaKey: string | null) => void;
};

export type PersonaSettingsUiHandle = {
    open: (roomTarget?: PersonaSettingsRoomTarget) => void;
    close: () => void;
    refreshAvatar: () => void;
};

const personaSettingsModal = document.getElementById('persona-settings-modal')!;
const closePersonaSettingsModal = document.getElementById('close-persona-settings-modal')!;
const cancelPersonaSettingsBtn = document.getElementById('cancel-persona-settings')!;
const savePersonaSettingsBtn = document.getElementById('save-persona-settings') as HTMLButtonElement;
const personaSettingsSubtitle = document.getElementById('persona-settings-subtitle')!;
const personaDescriptionEditor = document.getElementById('persona-description-editor') as HTMLInputElement;
const personaPromptEditor = document.getElementById('persona-prompt-editor') as HTMLTextAreaElement;
const personaGreetingEditor = document.getElementById('persona-greeting-editor') as HTMLTextAreaElement;
const personaFavoritePhotoPromptField = document.getElementById('persona-favorite-photo-prompt-field')!;
const personaFavoritePhotoPrompt = document.getElementById('persona-favorite-photo-prompt') as HTMLTextAreaElement;
const personaSettingsAvatarPreview = document.getElementById('persona-settings-avatar-preview')!;
const personaSettingsAvatarBtn = document.getElementById('persona-settings-avatar-btn') as HTMLButtonElement;
const personaPublicIdentityCheckbox = document.getElementById('persona-public-identity-checkbox') as HTMLInputElement;
const personaPublicIdentityPanel = document.getElementById('persona-public-identity-panel')!;
const personaPublicIdentityStatus = document.getElementById('persona-public-identity-status')!;
const personaPublicIdentitySummary = document.getElementById('persona-public-identity-summary') as HTMLTextAreaElement;
const personaPublicIdentityVisual = document.getElementById('persona-public-identity-visual') as HTMLTextAreaElement;
const personaPublicIdentitySource = document.getElementById('persona-public-identity-source') as HTMLAnchorElement;
const recheckPublicIdentityBtn = document.getElementById('recheck-public-identity-btn') as HTMLButtonElement;

let dependencies: PersonaSettingsUiDependencies | null = null;
let resolvedIdentity: PublicIdentity | null = null;
let resolvedAvatarUrl: string | null = null;
let roomTarget: PersonaSettingsRoomTarget = null;
let listenersReady = false;

const getDependencies = () => {
    if (!dependencies) throw new Error('Persona Settings UI dependencies are not initialized.');
    return dependencies;
};

const getPublicIdentityKindLabel = (kind: PublicIdentity['kind']) => {
    if (kind === 'real_person') return '真人公眾人物';
    if (kind === 'fictional_character') return '虛構角色';
    return '知名身份';
};

const refreshAvatar = () => {
    const persona = getDependencies().getCurrentPersona();
    personaSettingsAvatarPreview.innerHTML = '';
    if (!persona) return;

    if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
        const image = document.createElement('img');
        image.src = persona.avatarUrl;
        image.alt = persona.name;
        image.className = 'h-full w-full object-cover';
        personaSettingsAvatarPreview.appendChild(image);
        return;
    }

    const fallback = document.createElement('div');
    fallback.className = 'h-full w-full flex items-center justify-center text-3xl';
    fallback.textContent = persona.emoji;
    personaSettingsAvatarPreview.appendChild(fallback);
};

const renderPublicIdentitySettings = () => {
    const enabled = Boolean(personaPublicIdentityCheckbox.checked);
    const identity = resolvedIdentity;
    personaPublicIdentityPanel.classList.toggle('hidden', !enabled);
    personaPublicIdentitySummary.value = identity?.summary || '';
    personaPublicIdentityVisual.value = identity
        ? [identity.visualPrompt, identity.stylePrompt].filter(Boolean).join('\n\n')
        : '';
    personaPublicIdentityStatus.textContent = identity
        ? `${getPublicIdentityKindLabel(identity.kind)} · 已確認 ${identity.canonicalName}`
        : '尚未辨識；按儲存後開始搜尋。';
    personaPublicIdentitySource.classList.toggle('hidden', !identity?.sourceUrl);
    if (identity?.sourceUrl) {
        personaPublicIdentitySource.href = identity.sourceUrl;
        personaPublicIdentitySource.textContent = `查看來源：${identity.sourceTitle}`;
    } else {
        personaPublicIdentitySource.removeAttribute('href');
    }
};

const open = (nextRoomTarget: PersonaSettingsRoomTarget = null) => {
    const persona = getDependencies().getCurrentPersona();
    if (!persona) return;

    roomTarget = nextRoomTarget;
    personaSettingsSubtitle.textContent = `正在編輯：${persona.name}`;
    refreshAvatar();
    personaDescriptionEditor.value = persona.description || '';
    personaPromptEditor.value = persona.prompt || '';
    personaGreetingEditor.value = persona.greeting || '';
    personaFavoritePhotoPromptField.classList.toggle('hidden', Boolean(roomTarget));
    personaFavoritePhotoPrompt.value = persona.favoritePhotoPrompt || '';
    resolvedIdentity = persona.publicIdentity ? { ...persona.publicIdentity } : null;
    resolvedAvatarUrl = null;
    personaPublicIdentityCheckbox.checked = Boolean(persona.publicIdentityEnabled);
    renderPublicIdentitySettings();
    personaSettingsModal.classList.remove('hidden');
};

const close = () => {
    personaSettingsModal.classList.add('hidden');
    resolvedIdentity = null;
    resolvedAvatarUrl = null;
    roomTarget = null;
};

const resolvePublicIdentity = async () => {
    const deps = getDependencies();
    const persona = deps.getCurrentPersona();
    if (!persona) return false;
    const query = [persona.name, personaDescriptionEditor.value.trim()].filter(Boolean).join(' ');
    const result = await deps.resolvePublicIdentity(query);
    if (!result) return false;
    resolvedIdentity = result.identity;
    resolvedAvatarUrl = result.avatarUrl || null;
    renderPublicIdentitySettings();
    return true;
};

const save = async () => {
    const deps = getDependencies();
    const personaKey = deps.getCurrentPersonaKey();
    const persona = deps.getCurrentPersona();
    if (!personaKey || !persona) return;

    const description = personaDescriptionEditor.value.trim();
    const prompt = personaPromptEditor.value.trim();
    const greeting = personaGreetingEditor.value.trim();

    if (!prompt) {
        alert('人格主設定不能留空。');
        return;
    }

    const publicIdentityEnabled = personaPublicIdentityCheckbox.checked;
    savePersonaSettingsBtn.disabled = true;
    const originalButtonText = savePersonaSettingsBtn.textContent;
    savePersonaSettingsBtn.textContent = publicIdentityEnabled && !resolvedIdentity
        ? '正在辨識身份...'
        : '正在儲存...';

    try {
        if (publicIdentityEnabled && !resolvedIdentity) {
            const confirmed = await resolvePublicIdentity();
            if (!confirmed) return;
        }

        const publicIdentity = publicIdentityEnabled && resolvedIdentity
            ? {
                ...resolvedIdentity,
                summary: personaPublicIdentitySummary.value.trim() || resolvedIdentity.summary,
                visualPrompt: personaPublicIdentityVisual.value.trim() || resolvedIdentity.visualPrompt,
                stylePrompt: undefined,
            }
            : persona.publicIdentity;

        const previousGreeting = persona.greeting || '';
        const updates: Partial<Persona> = {
            description,
            prompt,
            greeting: greeting || previousGreeting,
            publicIdentityEnabled,
            publicIdentity,
        };
        if (!roomTarget) {
            updates.favoritePhotoPrompt = normalizeFavoritePhotoPrompt(personaFavoritePhotoPrompt.value);
        }
        if (publicIdentityEnabled && publicIdentity) {
            updates.avatarPrompt = [
                publicIdentity.visualPrompt,
                publicIdentity.stylePrompt,
                'single-character portrait',
            ].filter(Boolean).join(' ');
        }
        if (publicIdentityEnabled && resolvedAvatarUrl) {
            updates.avatarUrl = resolvedAvatarUrl;
        }

        deps.applySettings({
            personaKey,
            roomTarget,
            updates,
            previousGreeting,
            greeting,
            publicIdentityEnabled,
        });
        close();
    } finally {
        savePersonaSettingsBtn.disabled = false;
        savePersonaSettingsBtn.textContent = originalButtonText || '儲存人格';
    }
};

const setupListeners = () => {
    if (listenersReady) return;
    listenersReady = true;

    personaSettingsAvatarBtn.addEventListener('click', () => {
        getDependencies().requestAvatar(roomTarget, getDependencies().getCurrentPersonaKey());
    });
    personaPublicIdentityCheckbox.addEventListener('change', renderPublicIdentitySettings);
    recheckPublicIdentityBtn.addEventListener('click', () => {
        if (!getDependencies().getCurrentPersona() || !personaPublicIdentityCheckbox.checked) return;
        recheckPublicIdentityBtn.disabled = true;
        void resolvePublicIdentity().finally(() => {
            recheckPublicIdentityBtn.disabled = false;
        });
    });
    closePersonaSettingsModal.addEventListener('click', close);
    cancelPersonaSettingsBtn.addEventListener('click', close);
    savePersonaSettingsBtn.addEventListener('click', () => {
        void save();
    });
};

export const createPersonaSettingsUi = (
    nextDependencies: PersonaSettingsUiDependencies,
): PersonaSettingsUiHandle => {
    dependencies = nextDependencies;
    setupListeners();
    return { open, close, refreshAvatar };
};
