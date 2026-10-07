import type { MemoryManager } from '../managers.js';
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
        createGroupMemberList.appendChild(label);
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
    const selectedKeys = Array.from(createGroupMemberList.querySelectorAll<HTMLInputElement>('input:checked'))
        .map(input => input.value);
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
        selectedKeys.forEach((key, index) => {
            const persona = memoryManager.getPersona(key);
            if (!persona) return;
            roomManager.addMember(room.id, {
                id: `member_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
                sourcePersonaKey: key,
                persona: cloneRoomSnapshot(persona),
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
    const selected = selectedKeys.flatMap(key => {
        const persona = memoryManager.getPersona(key);
        return persona ? [{ sourcePersonaKey: key, persona }] : [];
    });
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
