export type ChatPerformanceEvent = {
    label: string;
    elapsedMs: number;
    durationMs?: number;
};

export type ChatPerformanceTurn = {
    id: string;
    startedAt: number;
    events: ChatPerformanceEvent[];
    completedAt?: number;
};

const MAX_RECORDED_TURNS = 24;
const PERF_STORAGE_KEY = 'wetappPerfEnabled';
let activeTurn: ChatPerformanceTurn | null = null;
const completedTurns: ChatPerformanceTurn[] = [];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const isEnabled = () => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(PERF_STORAGE_KEY) === '1'
            || new URLSearchParams(window.location.search).has('perf');
    } catch {
        return false;
    }
};

export const isChatPerformanceEnabled = () => isEnabled();

const expose = () => {
    if (typeof window === 'undefined' || !isEnabled()) return;
    Object.assign(window as Window & { __aigf4Perf?: unknown }, {
        __aigf4Perf: {
            active: activeTurn,
            completed: completedTurns,
        },
    });
};

export const startChatPerformanceTurn = () => {
    if (!isEnabled()) return;
    const startedAt = now();
    activeTurn = {
        id: `send-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        startedAt,
        events: [],
    };
    expose();
};

export const markChatPerformance = (label: string, startedAt?: number) => {
    if (!activeTurn || !isEnabled()) return;
    const finishedAt = now();
    const event: ChatPerformanceEvent = {
        label,
        elapsedMs: Math.round(finishedAt - activeTurn.startedAt),
        durationMs: startedAt === undefined ? undefined : Math.round(finishedAt - startedAt),
    };
    activeTurn.events.push(event);
    const duration = event.durationMs === undefined ? '' : ` (${event.durationMs}ms)`;
    console.info(`[aigf4 perf] ${label} ${event.elapsedMs}ms${duration}`);
    expose();
};

export const completeChatPerformanceTurn = (label = 'send:complete') => {
    if (!activeTurn || !isEnabled()) return;
    markChatPerformance(label);
    activeTurn.completedAt = now();
    completedTurns.unshift(activeTurn);
    completedTurns.splice(MAX_RECORDED_TURNS);
    activeTurn = null;
    expose();
};

export const cancelChatPerformanceTurn = (label = 'send:cancelled') => {
    if (!activeTurn || !isEnabled()) return;
    completeChatPerformanceTurn(label);
};
