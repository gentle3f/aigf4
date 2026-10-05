import type { MemoryManager, Persona } from '../managers.js';
import type { ChatRoom, RoomManager } from '../roomManager.js';
import { cloneRoomSnapshot } from '../roomManager.js';
import { buildContextBridge, selectLatestSceneHistory } from '../conversationTransfer.js';
import { emptyWardrobeState } from '../wardrobe.js';

export type NewSceneActionDependencies = {
    memoryManager: MemoryManager;
    roomManager: RoomManager;
    getConversationKey: () => string | null;
    getPersonaKey: () => string | null;
    getPersona: () => Persona | null;
    getRoom: () => ChatRoom | null;
    summarizeRoomMemory: (roomId: string, mode: 'recent' | 'full') => Promise<unknown>;
    summarizePersonaMemory: (personaKey: string, mode: 'recent' | 'full') => Promise<unknown>;
    appendSceneStart: () => void;
    refreshCurrentRoom: () => ChatRoom | null;
    hideMoreOptionsMenu: () => void;
    sceneEndMarker: string;
};

export const startNewScene = (deps: NewSceneActionDependencies) => {
    const conversationKey = deps.getConversationKey();
    if (!conversationKey) return;

    const room = deps.getRoom();
    const persona = deps.getPersona();
    const personaKey = deps.getPersonaKey();
    const completedSceneHistory = selectLatestSceneHistory(
        deps.memoryManager.peekChatHistory(conversationKey),
    );
    const transitionBridge = completedSceneHistory.length > 0
        ? buildContextBridge({
            kind: 'scene_transition',
            sourceConversationKey: conversationKey,
            sourceTitle: room?.title || persona?.name || '目前對話',
            history: completedSceneHistory,
            room: room || undefined,
            summaryOverride: room
                ? [
                    `已完成位置：${room.scene.location}`,
                    `已完成情節：${room.scene.summary}`,
                    room.scene.unresolved.length
                        ? `結束時尚未處理：${room.scene.unresolved.join('；')}`
                        : '',
                ].filter(Boolean).join('。')
                : '上一場景已完結；保留已發生的事件、關係變化、承諾與情感發展，新的即時狀態由下一則訊息建立。',
        })
        : undefined;

    if (room) void deps.summarizeRoomMemory(room.id, 'recent');
    else if (personaKey) void deps.summarizePersonaMemory(personaKey, 'recent');

    deps.appendSceneStart();
    deps.memoryManager.addMessage(conversationKey, 'system', {
        text: deps.sceneEndMarker,
        contextBridge: transitionBridge,
    });

    if (room) {
        const previousScene = cloneRoomSnapshot(room.scene);
        if (completedSceneHistory.length > 0 && previousScene.presentMemberIds.length > 0) {
            const sceneSummary = previousScene.summary
                || `在 ${previousScene.location || '上一幕'} 完成了一段共同經歷。`;
            const sourceMessageIds = completedSceneHistory
                .map(message => message.id)
                .filter((id): id is string => Boolean(id));

            deps.roomManager.addEpisodicMemories(room.id, [{
                kind: 'event',
                title: `已完成場景：${previousScene.location || '上一幕'}`,
                summary: sceneSummary,
                participants: [...previousScene.presentMemberIds],
                subjectIds: [...previousScene.presentMemberIds],
                knowerIds: [...previousScene.presentMemberIds],
                visibility: previousScene.presentMemberIds.length === room.members.length
                    ? 'shared'
                    : 'restricted',
                perspectives: previousScene.presentMemberIds.map(memberId => ({
                    memberId,
                    salience: 3,
                    knowledge: 'experienced',
                    summary: sceneSummary,
                })),
                importance: 3,
                sceneId: previousScene.id,
                unresolved: previousScene.unresolved.length > 0,
                sourceMessageIds,
                roleplayOnly: true,
            }]);
        }

        deps.roomManager.updateRoom(room.id, editableRoom => {
            editableRoom.scene.id = crypto.randomUUID?.() || `scene-${Date.now()}`;
            editableRoom.scene.startedAt = Date.now();
            editableRoom.scene.summary = '使用者剛開始一個新場景，等待建立位置、在場人物與事件。';
            editableRoom.scene.unresolved = [];
            editableRoom.scene.wardrobe = emptyWardrobeState();
        });
        deps.refreshCurrentRoom();
    }

    deps.hideMoreOptionsMenu();
};
