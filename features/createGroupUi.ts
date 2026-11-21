import type { MemoryManager } from '../managers.js';
import { GROUP_MEMBER_DISPLAY_NAME_LIMIT, normalizeGroupMemberDisplayName, isGroupMemberDisplayNameAvailable, withGroupMemberDisplayName } from '../groupMemberDisplayName.js';
import { VENICE_ASSISTANT_PERSONA_KEY } from '../personas.tsx';
import { ROOM_MEMBER_LIMIT, cloneRoomSnapshot } from '../roomManager.js';
import type { RoomManager } from '../roomManager.js';

type CreateGroupDependencies = {
    roomManager: Pick<RoomManager, 'getRoom' | 'addMember' | 'createRoom'>;
    memoryManager: Pick<MemoryManager, 'getAllPersonas' | 'getPersona' | 'addMessage'>;
    hideNewChatMenu: () => void;
    afterMembersAdded: () => void;
    afterRoomCreated: (roomId: string) => void;
};

const createGroupModal = document.getElementById('create-group-modal')!;
const closeCreateGroupBtn = document.getElementById('close-create-group') as HTMLButtonElement;
const createGroupName = document.getElementById('create-group-name') as HTMLInputElement;
const createGroupMemberList = document.getElementById('create-group-member-list')!;
const confirmCreateGroupBtn = document.getElementById('confirm-create-group') as HTMLButtonElement;

let groupModalTargetRoomId: string | null = null;
let activeDependencies: CreateGroupDependencies | null = null;

const renderCreateGroupMembers = () => {
    if (!activeDependencies) return;
    const { roomManager, memoryManager } = activeDependencies;
    createGroupMemberList.innerHTML = '';
    const targetRoom = groupModalTargetRoomId ? roomManager.getRoom(groupModalTargetRoomId) : null;
    const existingKeys = new Set(targetRoom?.members.map(member => member.sourcePersonaKey).filter(Boolean));
    Object.entries(memoryManager.getAllPersonas()).forEach(([key, persona]) => {
        if (
            key === VENICE_ASSISTANT_PERSONA_KEY
            || persona.gender !== 'female'
            || persona.timelineBranch
            || existingKeys.has(key)
        ) return;
        const label = document.createElement('label');
        label.className = 'create-group-member-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = key;
        const avatar = document.createElement('span');
        avatar.className = 'room-member-avatar';
        if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = persona.avatarUrl;
            image.alt = persona.name;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.fetchPriority = 'low';
            avatar.appendChild(image);
        } else avatar.textContent = persona.emoji || '●';
        const copy = document.createElement('span');
        copy.innerHTML = '<strong></strong><small></small>';
        copy.querySelector('strong')!.textContent = persona.name;
        copy.querySelector('small')!.textContent = persona.description;
        label.append(checkbox, avatar, copy);
        const option = document.createElement('div');
        option.className = 'create-group-member-entry';
        option.dataset.personaKey = key;
        const nameEditor = document.createElement('label');
        nameEditor.className = 'create-group-member-name-field';
        nameEditor.hidden = true;
        const nameCaption = document.createElement('span');
        nameCaption.textContent = '群組顯示名稱（選填）';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'create-group-member-display-name';
        nameInput.maxLength = GROUP_MEMBER_DISPLAY_NAME_LIMIT;
        nameInput.placeholder = '例如 Lisa；留空使用原名';
        nameInput.autocomplete = 'off';
        nameInput.disabled = true;
        checkbox.addEventListener('change', () => {
            nameEditor.hidden = !checkbox.checked;
            nameInput.disabled = !checkbox.checked;
        });
        nameEditor.append(nameCaption, nameInput);
        option.append(label, nameEditor);
        createGroupMemberList.appendChild(option);
    });
};

const closeCreateGroup = () => {
    createGroupModal.classList.add('hidden');
    groupModalTargetRoomId = null;
    activeDependencies = null;
};

const confirmCreateGroup = () => {
    const dependencies = activeDependencies;
    if (!dependencies) return;
    const { roomManager, memoryManager } = dependencies;
    const selectedOptions = Array.from(createGroupMemberList.querySelectorAll<HTMLElement>('.create-group-member-entry'))
        .filter(option => option.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);
    const selectedKeys = selectedOptions.map(option => option.dataset.personaKey || '').filter(Boolean);
    const selected = [];
    const usedNames = groupModalTargetRoomId
        ? (roomManager.getRoom(groupModalTargetRoomId)?.members.map(member => member.persona.name) || [])
        : [];
    for (const option of selectedOptions) {
        const key = option.dataset.personaKey || '';
        const persona = memoryManager.getPersona(key);
        if (!persona) continue;
        const proposed = option.querySelector<HTMLInputElement>('.create-group-member-display-name')?.value || '';
        const displayName = proposed.trim() ? normalizeGroupMemberDisplayName(proposed) : persona.name;
        if (!displayName) {
            alert('顯示名稱不可留空、超過 32 字或包含對話格式符號。');
            return;
        }
        if (!isGroupMemberDisplayNameAvailable(displayName, usedNames)) {
            alert(`群組已有「${displayName}」，請使用不同的名稱。`);
            return;
        }
        usedNames.push(displayName);
        selected.push({ sourcePersonaKey: key, persona: withGroupMemberDisplayName(persona, displayName) });
    }
    if (groupModalTargetRoomId) {
        const room = roomManager.getRoom(groupModalTargetRoomId);
        if (!room || selectedKeys.length === 0) {
            alert('請至少選擇 1 位角色。');
            return;
        }
        if (room.members.length + selectedKeys.length > ROOM_MEMBER_LIMIT) {
            alert(`每個群組最多 ${ROOM_MEMBER_LIMIT} 位角色。`);
            return;
        }
        selected.forEach((entry, index) => {
            roomManager.addMember(room.id, {
                id: `member_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
                sourcePersonaKey: entry.sourcePersonaKey,
                persona: cloneRoomSnapshot(entry.persona),
                joinedAt: Date.now(),
                soul: [],
                memories: [],
            });
        });
        closeCreateGroup();
        dependencies.afterMembersAdded();
        return;
    }

    if (selectedKeys.length < 2) {
        alert('群組至少需要 2 位角色。');
        return;
    }
    const room = roomManager.createRoom(createGroupName.value, selected);
    memoryManager.addMessage(room.id, 'system', { text: `${room.title} 已建立。` });
    closeCreateGroup();
    dependencies.afterRoomCreated(room.id);
};

export const openCreateGroup = (
    targetRoomId: string | null,
    dependencies: CreateGroupDependencies,
) => {
    groupModalTargetRoomId = targetRoomId;
    activeDependencies = dependencies;
    createGroupName.closest('label')?.classList.toggle('hidden', Boolean(targetRoomId));
    createGroupName.value = '';
    confirmCreateGroupBtn.textContent = targetRoomId ? '加入所選角色' : '建立群組';
    renderCreateGroupMembers();
    createGroupModal.classList.remove('hidden');
    dependencies.hideNewChatMenu();
};

closeCreateGroupBtn.addEventListener('click', closeCreateGroup);
confirmCreateGroupBtn.addEventListener('click', confirmCreateGroup);
