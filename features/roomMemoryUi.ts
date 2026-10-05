import type { MemoryManager, Persona, PersonaMemoryEntry } from '../managers.js';
import { AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES, AUTO_MEMORY_SUMMARY_VERSION } from '../autoMemoryPolicy.js';
import {
    getMemoryRecallLimit,
    getRoomMemoryKnowerIds,
    isDeepMemoryRecallQuery,
    isRoomWideMemory,
    normalizeMemoryImportance,
    scoreMemoryForQuery,
    selectRelevantMemories,
} from '../memoryRetrieval.js';
import type { ChatRoom, RoomManager, RoomMemoryEntry } from '../roomManager.js';
import type { SessionMemoryEntry } from '../sessionMemory.js';

type MemorySummaryRunResult =
    | { status: 'success'; added: number }
    | { status: 'skipped'; reason: 'not-found' | 'busy' | 'no-history' | 'threshold' }
    | { status: 'error'; message: string };

type RoomMemoryContext = {
    room: ChatRoom | null;
    personaKey: string | null;
    persona: Persona | null;
    activeRoomMemberId: string | null;
};

export type RoomMemoryUiDependencies = {
    getContext: () => RoomMemoryContext;
    memoryManager: Pick<MemoryManager,
        | 'peekChatHistory'
        | 'addPersonaMemory'
        | 'getPersonaMemoryEntries'
        | 'updatePersona'
        | 'updatePersonaMemory'
        | 'deletePersonaMemory'
    >;
    roomManager: Pick<RoomManager,
        | 'addSoulMemory'
        | 'addEpisodicMemories'
        | 'updateMemory'
        | 'setMemoryKnowerIds'
        | 'deleteMemory'
    >;
    isRoomSummaryInFlight: (roomId: string) => boolean;
    isPersonaSummaryInFlight: (personaKey: string) => boolean;
    summarizeRoomMemory: (roomId: string, mode: 'recent' | 'full') => Promise<MemorySummaryRunResult>;
    summarizePersonaMemory: (personaKey: string, mode: 'recent' | 'full') => Promise<MemorySummaryRunResult>;
    handleAuthRequired: () => void;
    authRequiredError: string;
    sanitizeFailureDetail: (message: string) => string;
    summaryTurnInterval: number;
    recentMessageLimit: number;
    getSessionMemories: (conversationKey: string) => SessionMemoryEntry[];
};

const roomInfoModal = document.getElementById('room-info-modal')!;
const roomMemoryModal = document.getElementById('room-memory-modal')!;
const closeRoomMemoryBtn = document.getElementById('close-room-memory') as HTMLButtonElement;
const roomMemoryTitle = document.getElementById('room-memory-title')!;
const memoryMemberTabs = document.getElementById('memory-member-tabs')!;
const memorySoulTab = document.getElementById('memory-soul-tab') as HTMLButtonElement;
const memoryEventTab = document.getElementById('memory-event-tab') as HTMLButtonElement;
const roomMemoryList = document.getElementById('room-memory-list')!;

let activeDependencies: RoomMemoryUiDependencies | null = null;
let memoryManager!: RoomMemoryUiDependencies['memoryManager'];
let roomManager!: RoomMemoryUiDependencies['roomManager'];
let currentRoom: ChatRoom | null = null;
let currentPersonaKey: string | null = null;
let currentPersona: Persona | null = null;
let activeRoomMemberId: string | null = null;
let selectedMemoryMemberId: string | null = null;
let selectedMemoryType: 'soul' | 'memory' = 'soul';
let manualMemoryUpdateNotice: {
    conversationKey: string;
    tone: 'running' | 'success' | 'error';
    text: string;
} | null = null;
let ROOM_MEMORY_SUMMARY_TURN_INTERVAL = 12;
let AUTO_MEMORY_RECENT_MESSAGE_LIMIT = 32;

const setDependencies = (dependencies: RoomMemoryUiDependencies) => {
    activeDependencies = dependencies;
    memoryManager = dependencies.memoryManager;
    roomManager = dependencies.roomManager;
    ROOM_MEMORY_SUMMARY_TURN_INTERVAL = dependencies.summaryTurnInterval;
    AUTO_MEMORY_RECENT_MESSAGE_LIMIT = dependencies.recentMessageLimit;
};

const syncContext = () => {
    if (!activeDependencies) return;
    const context = activeDependencies.getContext();
    currentRoom = context.room;
    currentPersonaKey = context.personaKey;
    currentPersona = context.persona;
    activeRoomMemberId = context.activeRoomMemberId;
};

const appendDiagnosticMemoryRows = (
    container: HTMLElement,
    title: string,
    entries: Array<PersonaMemoryEntry | RoomMemoryEntry>,
    query: string,
) => {
    const section = document.createElement('div');
    section.className = 'memory-v5-diagnostic-section';
    const heading = document.createElement('strong');
    heading.textContent = `${title} · ${entries.length}`;
    section.appendChild(heading);

    if (!entries.length) {
        const empty = document.createElement('span');
        empty.textContent = '沒有符合目前召回預算的項目。';
        section.appendChild(empty);
        container.appendChild(section);
        return;
    }

    const list = document.createElement('ol');
    entries.forEach(entry => {
        const item = document.createElement('li');
        const score = Math.round(scoreMemoryForQuery(entry, query));
        const tags = entry.searchTags?.length
            ? entry.searchTags.slice(0, 8).join(' · ')
            : '舊記憶：召回時即時計算本地索引';
        const sources = entry.sourceMessageIds?.length || 0;
        item.textContent = `${entry.title} · score ${score} · importance ${normalizeMemoryImportance(entry)}/5 · sources ${sources} · ${tags}`;
        if (entry.sourceMessageIds?.length) item.title = entry.sourceMessageIds.join('\n');
        list.appendChild(item);
    });
    section.appendChild(list);
    container.appendChild(section);
};

const createMemoryV5Diagnostics = ({
    conversationKey,
    room,
    member,
    personaKey,
    totalUserMessages,
    lastSummarized,
    remaining,
}: {
    conversationKey: string;
    room: ChatRoom | null;
    member: ChatRoom['members'][number] | undefined;
    personaKey: string | null;
    totalUserMessages: number;
    lastSummarized: number;
    remaining: number;
}) => {
    const details = document.createElement('details');
    details.className = 'memory-v5-diagnostics';

    const summary = document.createElement('summary');
    summary.textContent = 'Memory V5 診斷（本地，不會呼叫 AI）';
    details.appendChild(summary);

    const sessionEntries = activeDependencies?.getSessionMemories(conversationKey) || [];
    const soulEntries = room && member
        ? member.soul
        : personaKey
            ? memoryManager.getPersonaMemoryEntries(personaKey, 'soul')
            : [];
    const memberMemoryEntries = room && member
        ? member.memories
        : personaKey
            ? memoryManager.getPersonaMemoryEntries(personaKey, 'memory')
            : [];
    const roomWideEntries = room
        ? room.sharedMemories.filter(entry => isRoomWideMemory(entry, room))
        : [];
    const roomWideIds = new Set(roomWideEntries.map(entry => entry.id));
    const privateMemoryEntries = room
        ? memberMemoryEntries.filter(entry => !roomWideIds.has(entry.id))
        : memberMemoryEntries;
    const uniqueIndexEntries = Array.from(new Map(
        [...soulEntries, ...memberMemoryEntries, ...roomWideEntries].map(entry => [entry.id, entry]),
    ).values());
    const persistedIndexed = uniqueIndexEntries.filter(entry => entry.searchTags?.length).length;

    const metrics = document.createElement('div');
    metrics.className = 'memory-v5-diagnostic-metrics';
    [
        `Auto checkpoint：${Math.min(lastSummarized, totalUserMessages)} / ${totalUserMessages}`,
        `下一次整理：${remaining === 0 ? '已到門檻' : `再 ${remaining} 個 user turns`}`,
        `Session-only：${sessionEntries.length}`,
        `已持久化 search tags：${persistedIndexed} / ${uniqueIndexEntries.length}`,
    ].forEach(text => {
        const item = document.createElement('span');
        item.textContent = text;
        metrics.appendChild(item);
    });
    details.appendChild(metrics);

    if (sessionEntries.length) {
        const sessionBlock = document.createElement('div');
        sessionBlock.className = 'memory-v5-diagnostic-section';
        const heading = document.createElement('strong');
        heading.textContent = 'Session-only memory';
        const list = document.createElement('ul');
        sessionEntries.forEach(entry => {
            const item = document.createElement('li');
            const targets = entry.targetMemberIds.length
                ? `known_by=${entry.targetMemberIds.join(',')}`
                : 'current character';
            item.textContent = `${entry.summary} · ${targets}`;
            if (entry.sourceMessageIds?.length) item.title = entry.sourceMessageIds.join('\n');
            list.appendChild(item);
        });
        sessionBlock.append(heading, list);
        details.appendChild(sessionBlock);
    }

    const recent = [...privateMemoryEntries, ...roomWideEntries]
        .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
        .slice(0, 5);
    if (recent.length) {
        const recentBlock = document.createElement('div');
        recentBlock.className = 'memory-v5-diagnostic-section';
        const heading = document.createElement('strong');
        heading.textContent = '最近 5 項 memory.md 索引';
        const list = document.createElement('ul');
        recent.forEach(entry => {
            const item = document.createElement('li');
            const tags = entry.searchTags?.length ? entry.searchTags.slice(0, 8).join(' · ') : '未持久化 tags';
            item.textContent = `${entry.title} · sources ${entry.sourceMessageIds?.length || 0} · ${tags}`;
            if (entry.sourceMessageIds?.length) item.title = entry.sourceMessageIds.join('\n');
            list.appendChild(item);
        });
        recentBlock.append(heading, list);
        details.appendChild(recentBlock);
    }

    const tester = document.createElement('div');
    tester.className = 'memory-v5-recall-tester';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '測試召回，例如：你記唔記得沖繩嗰次？';
    input.setAttribute('aria-label', 'Memory V5 測試召回句子');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '模擬召回';
    const output = document.createElement('div');
    output.className = 'memory-v5-recall-results';

    const runRecallPreview = () => {
        output.innerHTML = '';
        const query = input.value.trim();
        if (!query) {
            output.textContent = '輸入一句測試query；只會在本機計算，不會發送出去。';
            return;
        }

        const deep = isDeepMemoryRecallQuery(query);
        const mode = document.createElement('p');
        mode.className = 'memory-v5-recall-mode';
        mode.textContent = deep
            ? 'Deep recall：ON（明確回憶過去）'
            : 'Deep recall：OFF（普通召回預算）';
        output.appendChild(mode);

        if (room && member) {
            const isPresent = room.scene.presentMemberIds.includes(member.id);
            const soulLimit = isPresent
                ? getMemoryRecallLimit(query, 8, 12)
                : getMemoryRecallLimit(query, 3, 5);
            const privateLimit = isPresent
                ? getMemoryRecallLimit(query, 7, 14)
                : 0;
            const sharedLimit = getMemoryRecallLimit(query, 8, 14);
            appendDiagnosticMemoryRows(
                output,
                'soul.md',
                selectRelevantMemories(member.soul, query, soulLimit),
                query,
            );
            appendDiagnosticMemoryRows(
                output,
                'private memory.md',
                selectRelevantMemories(privateMemoryEntries, query, privateLimit),
                query,
            );
            appendDiagnosticMemoryRows(
                output,
                'room-wide memory.md',
                selectRelevantMemories(roomWideEntries, query, sharedLimit),
                query,
            );
        } else {
            appendDiagnosticMemoryRows(
                output,
                'soul.md',
                selectRelevantMemories(
                    soulEntries,
                    query,
                    getMemoryRecallLimit(query, 12, 16),
                ),
                query,
            );
            appendDiagnosticMemoryRows(
                output,
                'memory.md',
                selectRelevantMemories(
                    privateMemoryEntries,
                    query,
                    getMemoryRecallLimit(query, 12, 24),
                ),
                query,
            );
        }
    };

    button.addEventListener('click', runRecallPreview);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runRecallPreview();
        }
    });
    tester.append(input, button, output);
    details.appendChild(tester);
    return details;
};

const renderRoomMemory = () => {
    syncContext();
    const room = currentRoom;
    const personaKey = room ? null : currentPersonaKey;
    const persona = room ? null : currentPersona;
    if (!room && (!personaKey || !persona)) return;
    roomMemoryTitle.textContent = `${room?.title || persona?.name || '角色'}的靈魂與記憶`;
    memoryMemberTabs.innerHTML = '';
    memoryMemberTabs.classList.toggle('hidden', !room);
    if (room) {
        if (!selectedMemoryMemberId || !room.members.some(member => member.id === selectedMemoryMemberId)) {
            selectedMemoryMemberId = activeRoomMemberId || room.leadMemberId;
        }
        room.members.forEach(member => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = member.id === selectedMemoryMemberId ? 'is-active' : '';
            button.textContent = member.persona.name;
            button.addEventListener('click', () => {
                selectedMemoryMemberId = member.id;
                renderRoomMemory();
            });
            memoryMemberTabs.appendChild(button);
        });
    }
    memorySoulTab.classList.toggle('is-active', selectedMemoryType === 'soul');
    memoryEventTab.classList.toggle('is-active', selectedMemoryType === 'memory');
    roomMemoryList.innerHTML = '';
    const member = room?.members.find(item => item.id === selectedMemoryMemberId);
    if (room && !member) return;

    if (selectedMemoryType === 'memory') {
        const conversationKey = room?.id || personaKey || '';
        const totalUserMessages = memoryManager.peekChatHistory(conversationKey)
            .filter(message => message.role === 'user').length;
        const lastSummarized = room
            ? Number(room.lastSummarizedUserMessageCount || 0)
            : Number(persona?.lastMemorySummaryUserMessageCount || 0);
        const summaryVersion = room
            ? Number(room.memorySummaryVersion || 0)
            : Number(persona?.memorySummaryVersion || 0);
        const inFlight = room ? activeDependencies?.isRoomSummaryInFlight(room.id) : Boolean(personaKey && activeDependencies?.isPersonaSummaryInFlight(personaKey));
        const needsRecovery = summaryVersion < AUTO_MEMORY_SUMMARY_VERSION
            && totalUserMessages >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
        const remaining = Math.max(0, ROOM_MEMORY_SUMMARY_TURN_INTERVAL - (totalUserMessages - lastSummarized));
        const status = document.createElement('div');
        status.className = 'auto-memory-status';
        const title = document.createElement('strong');
        title.textContent = inFlight ? '正在自動整理記憶' : '自動記憶運作中';
        const detail = document.createElement('span');
        detail.textContent = inFlight
            ? '完成後會直接寫入 memory.md。'
            : needsRecovery
                ? '偵測到舊版漏存的 checkpoint；下一次角色成功回覆後會自動補抓最近重要內容。'
                : remaining === 0 && totalUserMessages > lastSummarized
                    ? '已到整理門檻，下一次角色成功回覆後會更新。'
                    : `已處理至第 ${Math.min(lastSummarized, totalUserMessages)} / ${totalUserMessages} 則使用者訊息；再 ${remaining} 則自動整理。`;
        const runManualMemoryUpdate = async (mode: 'recent' | 'full') => {
            if (mode === 'full' && !confirm(
                '完整重掃會分批讀取這個聊天室的全部文字歷史，可能使用較多 API 額度；原始對話及現有記憶都不會被刪除。繼續？',
            )) return;
            manualMemoryUpdateNotice = {
                conversationKey,
                tone: 'running',
                text: mode === 'full'
                    ? '正在分批重掃全部文字歷史；請保持此頁開啟…'
                    : `正在讀取最近 ${AUTO_MEMORY_RECENT_MESSAGE_LIMIT} 個使用者回合並更新 memory.md…`,
            };
            renderRoomMemory();
            const result = room
                ? await activeDependencies!.summarizeRoomMemory(room.id, mode)
                : personaKey
                    ? await activeDependencies!.summarizePersonaMemory(personaKey, mode)
                    : { status: 'skipped', reason: 'not-found' } as const;
            if (result.status === 'success') {
                manualMemoryUpdateNotice = {
                    conversationKey,
                    tone: 'success',
                    text: result.added > 0
                        ? `${mode === 'full' ? '完整重掃' : '整理'}完成，已新增 ${result.added} 項重要記憶。`
                        : `${mode === 'full' ? '完整重掃' : '整理'}完成；沒有找到尚未保存的重要內容。`,
                };
            } else if (result.status === 'error') {
                if (result.message === activeDependencies?.authRequiredError) activeDependencies?.handleAuthRequired();
                manualMemoryUpdateNotice = {
                    conversationKey,
                    tone: 'error',
                    text: `整理失敗：${activeDependencies!.sanitizeFailureDetail(result.message).slice(0, 180)}`,
                };
            } else {
                const skippedReason = result.reason === 'busy'
                    ? '另一個記憶整理工作仍在進行。'
                    : result.reason === 'no-history'
                        ? '目前沒有足夠對話可以整理。'
                        : result.reason === 'threshold'
                            ? '尚未到自動整理門檻。'
                            : '目前聊天室已不存在。';
                manualMemoryUpdateNotice = { conversationKey, tone: 'error', text: skippedReason };
            }
            renderRoomMemory();
        };
        const manualActions = document.createElement('div');
        manualActions.className = 'manual-memory-update-actions';
        const manualButton = document.createElement('button');
        manualButton.type = 'button';
        manualButton.className = 'manual-memory-update-button';
        manualButton.disabled = inFlight || totalUserMessages === 0;
        manualButton.textContent = inFlight
            ? '正在整理…'
            : `整理最近 ${AUTO_MEMORY_RECENT_MESSAGE_LIMIT} 回合`;
        manualButton.addEventListener('click', () => void runManualMemoryUpdate('recent'));
        const fullScanButton = document.createElement('button');
        fullScanButton.type = 'button';
        fullScanButton.className = 'manual-memory-update-button is-secondary';
        fullScanButton.disabled = inFlight || totalUserMessages === 0;
        fullScanButton.textContent = '重新掃描全部歷史';
        fullScanButton.addEventListener('click', () => void runManualMemoryUpdate('full'));
        manualActions.append(manualButton, fullScanButton);
        status.append(title, detail, manualActions);
        if (manualMemoryUpdateNotice?.conversationKey === conversationKey) {
            const notice = document.createElement('span');
            notice.className = `manual-memory-update-notice is-${manualMemoryUpdateNotice.tone}`;
            notice.textContent = manualMemoryUpdateNotice.text;
            status.appendChild(notice);
        }
        roomMemoryList.appendChild(status);
        roomMemoryList.appendChild(createMemoryV5Diagnostics({
            conversationKey,
            room,
            member,
            personaKey,
            totalUserMessages,
            lastSummarized,
            remaining,
        }));
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'memory-add-button';
    addButton.textContent = selectedMemoryType === 'soul' ? '＋ 新增永久記憶' : '＋ 新增重要事件';
    addButton.addEventListener('click', () => {
        const title = window.prompt('記憶標題');
        if (!title?.trim()) return;
        const summary = window.prompt(selectedMemoryType === 'soul'
            ? '要讓角色永久記住甚麼？'
            : '這件重要事件發生了甚麼？');
        if (!summary?.trim()) return;
        if (room && member) {
            if (selectedMemoryType === 'soul') {
                roomManager.addSoulMemory(room.id, [member.id], {
                    kind: 'preference',
                    title: title.trim(),
                    summary: summary.trim(),
                    participants: [member.id],
                    subjectIds: [member.id],
                    knowerIds: [member.id],
                    visibility: 'restricted',
                    importance: 5,
                    perspectives: [{
                        memberId: member.id,
                        salience: 5,
                        knowledge: 'told',
                        summary: summary.trim(),
                    }],
                });
            } else {
                roomManager.addEpisodicMemories(room.id, [{
                    kind: 'event',
                    title: title.trim(),
                    summary: summary.trim(),
                    participants: [member.id],
                    subjectIds: [member.id],
                    knowerIds: [member.id],
                    visibility: 'restricted',
                    importance: 5,
                    perspectives: [{
                        memberId: member.id,
                        salience: 5,
                        knowledge: 'told',
                        summary: summary.trim(),
                    }],
                }]);
            }
        } else if (personaKey) {
            memoryManager.addPersonaMemory(personaKey, selectedMemoryType, {
                kind: selectedMemoryType === 'soul' ? 'preference' : 'event',
                title: title.trim(),
                summary: summary.trim(),
                importance: 5,
            });
        }
        renderRoomMemory();
    });
    roomMemoryList.appendChild(addButton);

    let entries: Array<RoomMemoryEntry | PersonaMemoryEntry> = [];
    if (room && member) {
        entries = selectedMemoryType === 'soul' ? member.soul : member.memories;
    } else if (personaKey && persona) {
        entries = [...memoryManager.getPersonaMemoryEntries(personaKey, selectedMemoryType)];
        if (selectedMemoryType === 'soul' && persona.memory?.trim()) {
            entries.unshift({
                id: 'legacy-persona-memory',
                kind: 'core',
                title: '舊版永久記憶',
                summary: persona.memory.trim(),
                createdAt: 0,
                pinned: true,
            });
        }
    }
    if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'room-memory-empty';
        empty.textContent = selectedMemoryType === 'soul'
            ? '尚未加入永久核心記憶。'
            : `尚未整理重要事件；系統會每 ${ROOM_MEMORY_SUMMARY_TURN_INTERVAL} 個使用者回合自動更新。`;
        roomMemoryList.appendChild(empty);
    }
    entries.forEach(entry => {
        const isLegacyPersonaMemory = !room && entry.id === 'legacy-persona-memory';
        const canonicalEntry = room && selectedMemoryType === 'memory'
            ? room.sharedMemories.find(item => item.id === entry.id)
            : undefined;
        const card = document.createElement('article');
        card.className = 'room-memory-card';
        const title = document.createElement('input');
        title.value = entry.title;
        title.disabled = isLegacyPersonaMemory;
        title.setAttribute('aria-label', '記憶標題');
        const summary = document.createElement('textarea');
        summary.rows = 4;
        summary.value = entry.summary;
        summary.setAttribute('aria-label', '記憶內容');
        const settings = document.createElement('div');
        settings.className = 'room-memory-settings';
        const importanceLabel = document.createElement('label');
        importanceLabel.textContent = '重要度';
        const importance = document.createElement('select');
        importance.disabled = isLegacyPersonaMemory;
        [
            [1, '1 · 輕微'],
            [2, '2 · 次要'],
            [3, '3 · 有用'],
            [4, '4 · 重要'],
            [5, '5 · 核心'],
        ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(label);
            option.selected = Number(entry.importance || (entry.pinned ? 5 : 3)) === value;
            importance.appendChild(option);
        });
        importanceLabel.appendChild(importance);
        settings.appendChild(importanceLabel);
        let unresolved: HTMLInputElement | null = null;
        if (selectedMemoryType === 'memory') {
            const unresolvedLabel = document.createElement('label');
            unresolvedLabel.className = 'room-memory-check';
            unresolved = document.createElement('input');
            unresolved.type = 'checkbox';
            unresolved.checked = Boolean(entry.unresolved);
            unresolvedLabel.append(unresolved, document.createTextNode('仍待跟進'));
            settings.appendChild(unresolvedLabel);
        }
        let knowerInputs: HTMLInputElement[] = [];
        let ownership: HTMLDetailsElement | null = null;
        if (room && canonicalEntry && selectedMemoryType === 'memory') {
            ownership = document.createElement('details');
            ownership.className = 'room-memory-ownership';
            const ownershipSummary = document.createElement('summary');
            ownershipSummary.textContent = '誰會長期記得這件事';
            const ownershipOptions = document.createElement('div');
            ownershipOptions.className = 'room-memory-knowers';
            const knowerIds = new Set(getRoomMemoryKnowerIds(canonicalEntry));
            knowerInputs = room.members.map(roomMember => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = roomMember.id;
                checkbox.checked = knowerIds.has(roomMember.id);
                label.append(checkbox, document.createTextNode(roomMember.persona.name));
                ownershipOptions.appendChild(label);
                return checkbox;
            });
            const hint = document.createElement('p');
            hint.textContent = '只勾真正親歷、目睹或後來被告知，而且會長期記住的人。';
            ownership.append(ownershipSummary, ownershipOptions, hint);
        }
        const meta = document.createElement('p');
        const perspective = canonicalEntry?.perspectives?.find(item => item.memberId === member?.id);
        meta.textContent = [
            entry.pinned ? '永久' : '事件',
            perspective?.knowledge === 'experienced'
                ? '親歷'
                : perspective?.knowledge === 'witnessed'
                    ? '目睹'
                    : perspective?.knowledge === 'told'
                        ? '被告知'
                        : '',
            entry.sceneId ? `場景 ${entry.sceneId.slice(0, 12)}` : '',
            entry.sourceMessageIds?.length ? `可追溯來源 ${entry.sourceMessageIds.length} 則` : '',
            entry.sourceMessageIndexes?.length ? `來源訊息 ${entry.sourceMessageIndexes.join(', ')}` : '',
        ].filter(Boolean).join(' · ');
        if (entry.sourceMessageIds?.length) meta.title = entry.sourceMessageIds.join('\n');
        const actions = document.createElement('div');
        actions.className = 'room-memory-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = '儲存';
        save.addEventListener('click', () => {
            if (room && member) {
                const selectedKnowers = canonicalEntry && knowerInputs.length
                    ? knowerInputs.filter(input => input.checked).map(input => input.value)
                    : [];
                if (canonicalEntry && knowerInputs.length && selectedKnowers.length === 0) {
                    alert('至少要保留一位真正記得這件事的角色。');
                    return;
                }
                roomManager.updateMemory(room.id, member.id, entry.id, selectedMemoryType, {
                    title: title.value,
                    summary: summary.value,
                    importance: Number(importance.value),
                    unresolved: Boolean(unresolved?.checked),
                });
                if (canonicalEntry && knowerInputs.length) {
                    roomManager.setMemoryKnowerIds(room.id, entry.id, selectedKnowers);
                    renderRoomMemory();
                    return;
                }
            } else if (personaKey) {
                if (isLegacyPersonaMemory) {
                    memoryManager.updatePersona(personaKey, { memory: summary.value.trim() });
                    if (currentPersona) currentPersona.memory = summary.value.trim();
                } else {
                    memoryManager.updatePersonaMemory(personaKey, selectedMemoryType, entry.id, {
                        title: title.value,
                        summary: summary.value,
                        importance: Number(importance.value),
                        unresolved: Boolean(unresolved?.checked),
                    });
                }
            }
            save.textContent = '已儲存';
            window.setTimeout(() => { save.textContent = '儲存'; }, 1000);
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'is-danger';
        remove.textContent = '刪除';
        remove.addEventListener('click', () => {
            if (!confirm(`刪除「${entry.title}」？`)) return;
            if (room && member) {
                roomManager.deleteMemory(room.id, member.id, entry.id, selectedMemoryType);
            } else if (personaKey) {
                if (isLegacyPersonaMemory) {
                    memoryManager.updatePersona(personaKey, { memory: '' });
                    if (currentPersona) currentPersona.memory = '';
                } else {
                    memoryManager.deletePersonaMemory(personaKey, selectedMemoryType, entry.id);
                }
            }
            renderRoomMemory();
        });
        actions.append(save, remove);
        card.append(title, summary, settings);
        if (ownership) card.appendChild(ownership);
        card.append(meta, actions);
        roomMemoryList.appendChild(card);
    });
};

export const openRoomMemory = (dependencies: RoomMemoryUiDependencies) => {
    setDependencies(dependencies);
    syncContext();
    if (!currentRoom && (!currentPersonaKey || !currentPersona)) return;
    selectedMemoryMemberId = currentRoom ? activeRoomMemberId || currentRoom.leadMemberId : null;
    renderRoomMemory();
    roomInfoModal.classList.add('hidden');
    roomMemoryModal.classList.remove('hidden');
};

const closeRoomMemory = () => roomMemoryModal.classList.add('hidden');

export const refreshRoomMemory = (dependencies: RoomMemoryUiDependencies) => {
    setDependencies(dependencies);
    renderRoomMemory();
};

closeRoomMemoryBtn.addEventListener('click', closeRoomMemory);
memorySoulTab.addEventListener('click', () => {
    selectedMemoryType = 'soul';
    renderRoomMemory();
});
memoryEventTab.addEventListener('click', () => {
    selectedMemoryType = 'memory';
    renderRoomMemory();
});