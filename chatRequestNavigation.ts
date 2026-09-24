// Navigation may leave a request running for another conversation. Reloading
// or destructively mutating its own conversation must still cancel it first.
export const shouldCancelActiveRequestForConversation = (
    activeConversationKey: string | undefined,
    targetConversationKey: string,
) => activeConversationKey === targetConversationKey;

export const shouldRenderCompletedReplyInConversation = (
    visibleConversationKey: string | null,
    requestConversationKey: string,
) => visibleConversationKey === requestConversationKey;
