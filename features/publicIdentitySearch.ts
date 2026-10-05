import type { PublicIdentity } from '../managers.js';
import { loadPublicIdentityMedia, searchPublicIdentities } from '../publicIdentity.js';
import type { PublicIdentityCandidate, PublicIdentityMedia } from '../publicIdentity.js';

export type PublicIdentityResolution = {
    identity: PublicIdentity;
    avatarUrl?: string;
    candidate?: PublicIdentityCandidate;
};

export type PublicIdentitySearchDependencies = {
    buildConfirmedIdentity: (candidate: PublicIdentityCandidate, selectedMedia: PublicIdentityMedia | null) => Promise<PublicIdentity>;
    isAbortError: (error: unknown) => boolean;
    handleAuthRequired: () => void;
    authRequiredError: string;
};

const publicIdentityModal = document.getElementById('public-identity-modal')!;
const closePublicIdentityModalBtn = document.getElementById('close-public-identity-modal') as HTMLButtonElement;
const publicIdentityQuery = document.getElementById('public-identity-query') as HTMLInputElement;
const searchPublicIdentityBtn = document.getElementById('search-public-identity-btn') as HTMLButtonElement;
const publicIdentityStatus = document.getElementById('public-identity-status')!;
const publicIdentityCandidatesContainer = document.getElementById('public-identity-candidates')!;
const publicIdentityMediaSection = document.getElementById('public-identity-media-section')!;
const publicIdentityMediaContainer = document.getElementById('public-identity-media')!;
const cancelPublicIdentityBtn = document.getElementById('cancel-public-identity') as HTMLButtonElement;
const confirmPublicIdentityBtn = document.getElementById('confirm-public-identity') as HTMLButtonElement;

let publicIdentityCandidates: PublicIdentityCandidate[] = [];
let selectedPublicIdentityCandidate: PublicIdentityCandidate | null = null;
let publicIdentityMedia: PublicIdentityMedia[] = [];
let selectedPublicIdentityMedia: PublicIdentityMedia | null = null;
let publicIdentityLookupController: AbortController | null = null;
let publicIdentityResolver: ((value: PublicIdentityResolution | null) => void) | null = null;
let isPublicIdentityBusy = false;
let activeDependencies: PublicIdentitySearchDependencies | null = null;

const isFeatureAbortError = (error: unknown) => (
    activeDependencies?.isAbortError(error)
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
);

const handleFeatureAuthError = (message: string) => {
    if (message === activeDependencies?.authRequiredError) activeDependencies.handleAuthRequired();
};
const setPublicIdentityStatus = (text: string, tone: 'idle' | 'error' | 'success' = 'idle') => {
    publicIdentityStatus.textContent = text;
    publicIdentityStatus.classList.remove(
        'border-cyan-500/20',
        'bg-cyan-500/5',
        'text-cyan-100',
        'border-red-500/25',
        'bg-red-500/10',
        'text-red-200',
        'border-emerald-500/25',
        'bg-emerald-500/10',
        'text-emerald-100',
    );
    if (tone === 'error') {
        publicIdentityStatus.classList.add('border-red-500/25', 'bg-red-500/10', 'text-red-200');
    } else if (tone === 'success') {
        publicIdentityStatus.classList.add('border-emerald-500/25', 'bg-emerald-500/10', 'text-emerald-100');
    } else {
        publicIdentityStatus.classList.add('border-cyan-500/20', 'bg-cyan-500/5', 'text-cyan-100');
    }
};

const setPublicIdentityBusy = (busy: boolean) => {
    isPublicIdentityBusy = busy;
    searchPublicIdentityBtn.disabled = busy;
    publicIdentityQuery.disabled = busy;
    confirmPublicIdentityBtn.disabled = busy || !selectedPublicIdentityCandidate;
    publicIdentityCandidatesContainer.querySelectorAll('button').forEach(button => {
        (button as HTMLButtonElement).disabled = busy;
    });
};

const renderPublicIdentityCandidates = () => {
    publicIdentityCandidatesContainer.innerHTML = '';
    publicIdentityCandidates.forEach(candidate => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `public-identity-candidate${selectedPublicIdentityCandidate?.id === candidate.id ? ' is-selected' : ''}`;
        button.disabled = isPublicIdentityBusy;

        if (candidate.thumbnailUrl) {
            const image = document.createElement('img');
            image.className = 'public-identity-candidate-image';
            image.src = candidate.thumbnailUrl;
            image.alt = `${candidate.title} 代表圖片`;
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
            button.appendChild(image);
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'public-identity-candidate-placeholder';
            placeholder.textContent = candidate.title.slice(0, 1).toUpperCase() || '?';
            button.appendChild(placeholder);
        }

        const copy = document.createElement('span');
        copy.className = 'public-identity-candidate-copy';
        const title = document.createElement('strong');
        title.textContent = candidate.title;
        const description = document.createElement('span');
        description.textContent = candidate.description || `${candidate.language.toUpperCase()} Wikipedia`;
        const extract = document.createElement('p');
        extract.textContent = candidate.extract || '請開啟來源頁面查看更多資料。';
        copy.append(title, description, extract);
        button.appendChild(copy);
        button.addEventListener('click', () => {
            void selectPublicIdentityCandidate(candidate);
        });
        publicIdentityCandidatesContainer.appendChild(button);
    });
};

const renderPublicIdentityMedia = () => {
    publicIdentityMediaContainer.innerHTML = '';
    if (publicIdentityMedia.length === 0) {
        publicIdentityMediaSection.classList.add('hidden');
        return;
    }

    publicIdentityMediaSection.classList.remove('hidden');
    const keepButton = document.createElement('button');
    keepButton.type = 'button';
    keepButton.className = `public-identity-media-choice is-keep${selectedPublicIdentityMedia ? '' : ' is-selected'}`;
    keepButton.innerHTML = '<span><strong class="block text-cyan-100">保留目前頭像</strong><span class="mt-2 block text-xs text-gray-400">只保存身份與圖片 Prompt</span></span>';
    keepButton.addEventListener('click', () => {
        selectedPublicIdentityMedia = null;
        renderPublicIdentityMedia();
    });
    publicIdentityMediaContainer.appendChild(keepButton);

    publicIdentityMedia.forEach(media => {
        const wrapper = document.createElement('div');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `public-identity-media-choice w-full${selectedPublicIdentityMedia?.thumbnailUrl === media.thumbnailUrl ? ' is-selected' : ''}`;
        const image = document.createElement('img');
        image.src = media.thumbnailUrl;
        image.alt = media.title;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        const copy = document.createElement('span');
        copy.className = 'public-identity-media-choice-copy';
        copy.textContent = media.title.replace(/^File:/u, '');
        button.append(image, copy);
        button.addEventListener('click', () => {
            selectedPublicIdentityMedia = media;
            renderPublicIdentityMedia();
        });
        const source = document.createElement('a');
        source.className = 'mt-1 block truncate px-1 text-[0.65rem] text-cyan-300 underline underline-offset-2';
        source.href = media.sourceUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.textContent = `來源 · ${media.license}`;
        wrapper.append(button, source);
        publicIdentityMediaContainer.appendChild(wrapper);
    });
};

const selectPublicIdentityCandidate = async (candidate: PublicIdentityCandidate) => {
    publicIdentityLookupController?.abort();
    selectedPublicIdentityCandidate = candidate;
    selectedPublicIdentityMedia = null;
    publicIdentityMedia = [];
    renderPublicIdentityCandidates();
    renderPublicIdentityMedia();
    setPublicIdentityStatus(`已選擇「${candidate.title}」，正在尋找可用的代表圖片...`);
    setPublicIdentityBusy(true);

    const controller = new AbortController();
    publicIdentityLookupController = controller;
    try {
        const loadedMedia = await loadPublicIdentityMedia(candidate, controller.signal);
        const leadMedia: PublicIdentityMedia[] = candidate.thumbnailUrl ? [{
            title: `${candidate.title}（Wikipedia 代表圖片）`,
            thumbnailUrl: candidate.thumbnailUrl,
            originalUrl: candidate.originalImageUrl || candidate.thumbnailUrl,
            sourceUrl: candidate.pageUrl,
            license: '請查看來源頁面',
        }] : [];
        const seen = new Set<string>();
        publicIdentityMedia = [...leadMedia, ...loadedMedia].filter(media => {
            const key = media.thumbnailUrl.replace(/\?.*$/u, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 7);
        renderPublicIdentityMedia();
        setPublicIdentityStatus(
            `你要建立的是「${candidate.title}」嗎？確認後會整理身份與圖片畫風。`,
            'success',
        );
    } catch (error) {
        if (isFeatureAbortError(error)) return;
        const message = error instanceof Error ? error.message : '代表圖片讀取失敗。';
        handleFeatureAuthError(message);
        setPublicIdentityStatus(`已選擇「${candidate.title}」。代表圖片暫時讀取不到，但仍可確認身份。`, 'success');
    } finally {
        if (publicIdentityLookupController === controller) publicIdentityLookupController = null;
        setPublicIdentityBusy(false);
        renderPublicIdentityCandidates();
    }
};

const searchForPublicIdentity = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
        setPublicIdentityStatus('請輸入名字，或補充作品、職業、國家再搜尋。', 'error');
        return;
    }

    publicIdentityLookupController?.abort();
    publicIdentityCandidates = [];
    selectedPublicIdentityCandidate = null;
    selectedPublicIdentityMedia = null;
    publicIdentityMedia = [];
    publicIdentityCandidatesContainer.innerHTML = '';
    renderPublicIdentityMedia();
    setPublicIdentityStatus(`正在 Wikipedia 搜尋「${query}」...`);
    setPublicIdentityBusy(true);

    const controller = new AbortController();
    publicIdentityLookupController = controller;
    try {
        publicIdentityCandidates = await searchPublicIdentities(query, controller.signal);
        if (publicIdentityCandidates.length === 0) {
            setPublicIdentityStatus('找不到合適條目。請加入作品名、團體、國家或職業再搜尋。', 'error');
            return;
        }
        selectedPublicIdentityCandidate = publicIdentityCandidates[0];
        renderPublicIdentityCandidates();
    } catch (error) {
        if (isFeatureAbortError(error)) return;
        const message = error instanceof Error ? error.message : '公開資料搜尋失敗。';
        handleFeatureAuthError(message);
        setPublicIdentityStatus(`搜尋失敗：${message}`, 'error');
        return;
    } finally {
        if (publicIdentityLookupController === controller) publicIdentityLookupController = null;
        setPublicIdentityBusy(false);
    }

    if (selectedPublicIdentityCandidate) {
        await selectPublicIdentityCandidate(selectedPublicIdentityCandidate);
    }
};

const closePublicIdentityResolution = (result: PublicIdentityResolution | null = null) => {
    publicIdentityLookupController?.abort();
    publicIdentityLookupController = null;
    publicIdentityModal.classList.add('hidden');
    const resolver = publicIdentityResolver;
    publicIdentityResolver = null;
    activeDependencies = null;
    resolver?.(result);
};

export const requestPublicIdentityResolution = (
    initialQuery: string,
    dependencies: PublicIdentitySearchDependencies,
): Promise<PublicIdentityResolution | null> => {
    publicIdentityLookupController?.abort();
    if (publicIdentityResolver) {
        publicIdentityResolver(null);
        publicIdentityResolver = null;
    }
    activeDependencies = dependencies;
    publicIdentityCandidates = [];
    selectedPublicIdentityCandidate = null;
    publicIdentityMedia = [];
    selectedPublicIdentityMedia = null;
    publicIdentityCandidatesContainer.innerHTML = '';
    publicIdentityMediaContainer.innerHTML = '';
    publicIdentityMediaSection.classList.add('hidden');
    publicIdentityQuery.value = initialQuery.trim();
    publicIdentityModal.classList.remove('hidden');
    setPublicIdentityStatus('正在搜尋公開資料...');
    confirmPublicIdentityBtn.disabled = true;

    const result = new Promise<PublicIdentityResolution | null>(resolve => {
        publicIdentityResolver = resolve;
    });
    void searchForPublicIdentity(initialQuery);
    return result;
};

const confirmSelectedPublicIdentity = async () => {
    if (!selectedPublicIdentityCandidate || isPublicIdentityBusy || !activeDependencies) return;
    const candidate = selectedPublicIdentityCandidate;
    const dependencies = activeDependencies;
    setPublicIdentityBusy(true);
    setPublicIdentityStatus(`正在整理「${candidate.title}」的標準身份與圖片描述...`);
    try {
        const identity = await dependencies.buildConfirmedIdentity(candidate, selectedPublicIdentityMedia);
        closePublicIdentityResolution({
            identity,
            avatarUrl: selectedPublicIdentityMedia?.thumbnailUrl,
            candidate,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : '身份資料整理失敗。';
        handleFeatureAuthError(message);
        setPublicIdentityStatus(`整理失敗：${message}`, 'error');
    } finally {
        setPublicIdentityBusy(false);
    }
};


closePublicIdentityModalBtn.addEventListener('click', () => closePublicIdentityResolution());
cancelPublicIdentityBtn.addEventListener('click', () => closePublicIdentityResolution());
searchPublicIdentityBtn.addEventListener('click', () => {
    void searchForPublicIdentity(publicIdentityQuery.value);
});
publicIdentityQuery.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void searchForPublicIdentity(publicIdentityQuery.value);
});
confirmPublicIdentityBtn.addEventListener('click', () => {
    void confirmSelectedPublicIdentity();
});