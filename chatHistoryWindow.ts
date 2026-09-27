export const CHAT_HISTORY_INITIAL_RENDER_LIMIT = 80;
export const CHAT_HISTORY_PREPEND_BATCH_SIZE = 60;
export const CHAT_HISTORY_PRELOAD_SCROLL_PX = 120;

export const getInitialChatHistoryStartIndex = (
    totalMessages: number,
    limit = CHAT_HISTORY_INITIAL_RENDER_LIMIT,
) => Math.max(0, Math.max(0, totalMessages) - Math.max(1, limit));

export const getPreviousChatHistoryStartIndex = (
    currentStartIndex: number,
    batchSize = CHAT_HISTORY_PREPEND_BATCH_SIZE,
) => Math.max(0, Math.max(0, currentStartIndex) - Math.max(1, batchSize));

export const getHiddenChatHistoryCount = (startIndex: number) => Math.max(0, startIndex);
