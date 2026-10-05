export type ChatSearchUiDependencies = {
    getHiddenHistoryCount: () => number;
    expandOlderHistory: (count: number) => void;
};

export type ChatSearchUiHandle = {
    open: () => void;
    close: () => void;
};

const chatContainer = document.getElementById('chat-container')!;
const chatSearchBar = document.getElementById('chat-search-bar')!;
const chatSearchInput = document.getElementById('chat-search-input') as HTMLInputElement;
const chatSearchCount = document.getElementById('chat-search-count')!;
const chatSearchClose = document.getElementById('chat-search-close') as HTMLButtonElement;
const chatSearchPrev = document.getElementById('chat-search-prev') as HTMLButtonElement;
const chatSearchNext = document.getElementById('chat-search-next') as HTMLButtonElement;

let dependencies: ChatSearchUiDependencies | null = null;
let chatSearchMatches: HTMLElement[] = [];
let chatSearchMatchIndex = -1;
let listenersReady = false;

const getDeps = () => {
    if (!dependencies) throw new Error('Chat Search dependencies are not initialized.');
    return dependencies;
};

const clearMatches = () => {
    chatSearchMatches.forEach(element => element.classList.remove('chat-search-match', 'is-current'));
    chatSearchMatches = [];
    chatSearchMatchIndex = -1;
    chatSearchCount.textContent = '0 / 0';
    chatSearchPrev.disabled = true;
    chatSearchNext.disabled = true;
};

const focusMatch = (index: number) => {
    if (chatSearchMatches.length === 0) return;
    chatSearchMatches.forEach(element => element.classList.remove('is-current'));
    chatSearchMatchIndex = (index + chatSearchMatches.length) % chatSearchMatches.length;
    const current = chatSearchMatches[chatSearchMatchIndex];
    current.classList.add('is-current');
    chatSearchCount.textContent = `${chatSearchMatchIndex + 1} / ${chatSearchMatches.length}`;
    current.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

const runSearch = () => {
    clearMatches();
    const query = chatSearchInput.value.trim().toLocaleLowerCase();
    if (!query) return;

    const hiddenHistoryCount = getDeps().getHiddenHistoryCount();
    if (hiddenHistoryCount > 0) getDeps().expandOlderHistory(hiddenHistoryCount);

    chatSearchMatches = Array.from(chatContainer.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter(element => element.textContent?.toLocaleLowerCase().includes(query));
    chatSearchMatches.forEach(element => element.classList.add('chat-search-match'));

    const hasMatches = chatSearchMatches.length > 0;
    chatSearchPrev.disabled = !hasMatches;
    chatSearchNext.disabled = !hasMatches;
    if (hasMatches) focusMatch(chatSearchMatches.length - 1);
};

const open = () => {
    chatSearchBar.classList.remove('hidden');
    chatSearchInput.focus();
    chatSearchInput.select();
    runSearch();
};

const close = () => {
    clearMatches();
    chatSearchInput.value = '';
    chatSearchBar.classList.add('hidden');
};

const setupListeners = () => {
    if (listenersReady) return;
    listenersReady = true;

    chatSearchClose.addEventListener('click', close);
    chatSearchInput.addEventListener('input', runSearch);
    chatSearchInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key === 'Enter' && chatSearchMatches.length > 0) {
            event.preventDefault();
            focusMatch(chatSearchMatchIndex + (event.shiftKey ? -1 : 1));
        }
    });
    chatSearchPrev.addEventListener('click', () => focusMatch(chatSearchMatchIndex - 1));
    chatSearchNext.addEventListener('click', () => focusMatch(chatSearchMatchIndex + 1));
};

export const createChatSearchUi = (
    nextDependencies: ChatSearchUiDependencies,
): ChatSearchUiHandle => {
    dependencies = nextDependencies;
    setupListeners();
    return { open, close };
};
