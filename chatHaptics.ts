const REPLY_VISIBLE_VIBRATION_MS = 35;

export const notifyReplyVisible = () => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(REPLY_VISIBLE_VIBRATION_MS);
    } catch {
        // Haptics are optional and must never affect chat delivery.
    }
};

export const scheduleReplyVisibleHaptic = () => {
    if (typeof requestAnimationFrame !== 'function') return;
    try {
        requestAnimationFrame(() => {
            requestAnimationFrame(notifyReplyVisible);
        });
    } catch {
        // Rendering and delivery remain independent of haptic support.
    }
};
