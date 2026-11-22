/**
 * UI 2.0 composer autosize.
 * Native field-sizing avoids JS entirely on each keystroke where supported.
 * Unsupported browsers defer the one necessary scrollHeight read to RAF,
 * rather than forcing 2 synchronous layout reads in the input handler.
 */
export interface AutoSizeTextarea {
    readonly scrollHeight: number;
    scrollTop: number;
    style: Pick<CSSStyleDeclaration, 'height' | 'overflowY' | 'setProperty' | 'removeProperty'>;
}
export interface ComposerAutoSizeOptions {
    textarea: AutoSizeTextarea;
    isV2: () => boolean;
    nativeContentSizing: () => boolean;
    requestFrame: (callback: FrameRequestCallback) => number;
    cancelFrame: (handle: number) => void;
    classicHeight: string;
}

export const createComposerAutoSize = (opts: ComposerAutoSizeOptions) => {
    let pending: number | null = null;
    const cancelPending = () => {
        if (pending === null) return;
        opts.cancelFrame(pending);
        pending = null;
    };
    const sync = () => {
        if (!opts.isV2()) {
            cancelPending();
            if (opts.textarea.style.height !== opts.classicHeight) {
                opts.textarea.style.height = opts.classicHeight;
            }
            return;
        }
        if (opts.nativeContentSizing()) return;
        if (pending !== null) return;
        pending = opts.requestFrame(() => {
            pending = null;
            if (!opts.isV2() || opts.nativeContentSizing()) return;
            opts.textarea.style.setProperty('height', 'auto', 'important');
            const actualScrollHeight = opts.textarea.scrollHeight;
            const nextHeight = Math.min(136, Math.max(44, actualScrollHeight));
            opts.textarea.style.setProperty('height', `${nextHeight}px`, 'important');
            opts.textarea.style.overflowY = actualScrollHeight > 136 ? 'auto' : 'hidden';
        });
    };
    const reset = () => {
        cancelPending();
        if (opts.isV2()) {
            if (opts.nativeContentSizing()) {
                opts.textarea.style.removeProperty('height');
                opts.textarea.style.removeProperty('overflow-y');
            } else {
                opts.textarea.style.setProperty('height', '44px', 'important');
                opts.textarea.style.overflowY = 'hidden';
            }
        } else {
            opts.textarea.style.height = opts.classicHeight;
        }
        opts.textarea.scrollTop = 0;
    };
    return { sync, reset, cancelPending };
};
