export type VisibilityAwareTimeoutEnvironment = {
    now: () => number;
    isVisible: () => boolean;
    setTimeout: (callback: () => void, delayMs: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    addVisibilityChangeListener: (listener: () => void) => void;
    removeVisibilityChangeListener: (listener: () => void) => void;
};

type VisibilityAwareTimeoutOptions = {
    timeoutMs: number;
    onTimeout: () => void;
    signal?: AbortSignal;
    onAbort?: () => void;
    environment?: VisibilityAwareTimeoutEnvironment;
};

const browserEnvironment: VisibilityAwareTimeoutEnvironment = {
    now: () => performance.now(),
    isVisible: () => document.visibilityState !== 'hidden',
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: handle => window.clearTimeout(handle as number),
    addVisibilityChangeListener: listener => document.addEventListener('visibilitychange', listener),
    removeVisibilityChangeListener: listener => document.removeEventListener('visibilitychange', listener),
};

// Interactive chat budgets count visible time only. Browser suspension still cannot
// guarantee a response after the OS terminates the page or PWA process.
export const createVisibilityAwareTimeout = ({
    timeoutMs,
    onTimeout,
    signal,
    onAbort,
    environment = browserEnvironment,
}: VisibilityAwareTimeoutOptions) => {
    let remainingMs = timeoutMs;
    let visibleSince: number | null = null;
    let timeoutHandle: unknown;
    let finished = false;

    const clearScheduledTimeout = () => {
        if (timeoutHandle === undefined) return;
        environment.clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
    };

    const detach = () => {
        environment.removeVisibilityChangeListener(handleVisibilityChange);
        signal?.removeEventListener('abort', handleAbort);
    };

    const finishWithTimeout = () => {
        if (finished) return;
        finished = true;
        visibleSince = null;
        clearScheduledTimeout();
        detach();
        onTimeout();
    };

    const consumeVisibleTime = () => {
        if (visibleSince === null) return;
        const elapsedMs = Math.max(0, environment.now() - visibleSince);
        remainingMs = Math.max(0, remainingMs - elapsedMs);
        visibleSince = null;
    };

    const pause = () => {
        consumeVisibleTime();
        clearScheduledTimeout();
    };

    const resume = () => {
        if (finished || !environment.isVisible()) return;
        if (remainingMs <= 0) {
            finishWithTimeout();
            return;
        }
        visibleSince = environment.now();
        timeoutHandle = environment.setTimeout(() => {
            timeoutHandle = undefined;
            consumeVisibleTime();
            if (remainingMs <= 0) finishWithTimeout();
            else resume();
        }, remainingMs);
    };

    const handleVisibilityChange = () => {
        if (environment.isVisible()) resume();
        else pause();
    };

    const handleAbort = () => {
        if (finished) return;
        finished = true;
        visibleSince = null;
        clearScheduledTimeout();
        detach();
        onAbort?.();
    };

    environment.addVisibilityChangeListener(handleVisibilityChange);
    if (signal?.aborted) handleAbort();
    else signal?.addEventListener('abort', handleAbort, { once: true });
    resume();

    return {
        cancel: () => {
            if (finished) return;
            finished = true;
            visibleSince = null;
            clearScheduledTimeout();
            detach();
        },
    };
};
