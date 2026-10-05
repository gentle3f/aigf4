import type { Persona } from '../managers.js';
import type { ChatRoom, RoomMember } from '../roomManager.js';
import type { PublicIdentityResolution } from './publicIdentitySearch.js';
import { optimizeAvatarDataUrl } from './avatarImage.js';

export type AvatarAdminTarget =
    | { personaKey: string }
    | { roomId: string; memberId: string };

export type AvatarAdminUiDependencies = {
    assistantPersonaKey: string;
    getPersona: (key: string) => Persona | undefined;
    getRoom: (roomId: string) => ChatRoom | undefined;
    getRoomMember: (roomId: string, memberId: string) => RoomMember | undefined;
    updatePersona: (key: string, update: Partial<Persona>) => void;
    updateRoomMemberPersona: (roomId: string, memberId: string, update: Partial<Persona>) => void;
    saveLocalAvatar: (target: AvatarAdminTarget, avatarUrl: string) => Promise<void>;
    resolvePublicIdentity: (query: string) => Promise<PublicIdentityResolution | null>;
    refreshAvatarUi: () => void;
    suspendRoomInfo: () => boolean;
    restoreRoomInfo: (wasVisible: boolean) => void;
};

export type AvatarAdminUiHandle = {
    openPersona: (key: string) => void;
    openRoomMember: (roomId: string, memberId: string) => void;
    openRoom: (roomId: string) => void;
    close: () => void;
};

const avatarSourceModal = document.getElementById('avatar-source-modal')!;
const avatarSourceTitle = document.getElementById('avatar-source-title')!;
const avatarSourceMembers = document.getElementById('avatar-source-members')!;
const avatarSourceOptions = document.getElementById('avatar-source-options')!;
const closeAvatarSourceModalBtn = document.getElementById('close-avatar-source-modal') as HTMLButtonElement;
const avatarSourceLocalBtn = document.getElementById('avatar-source-local') as HTMLButtonElement;
const avatarSourceSearchBtn = document.getElementById('avatar-source-search') as HTMLButtonElement;
const avatarUploadInput = document.getElementById('avatar-upload-input') as HTMLInputElement;

let dependencies: AvatarAdminUiDependencies | null = null;
let avatarSourceTarget: AvatarAdminTarget | null = null;
let pendingLocalUploadTarget: AvatarAdminTarget | null = null;
let listenersReady = false;

const getDependencies = () => {
    if (!dependencies) throw new Error('Avatar Admin UI dependencies are not initialized.');
    return dependencies;
};

const showTargetOptions = (title: string, target: AvatarAdminTarget) => {
    avatarSourceTarget = target;
    avatarSourceTitle.textContent = title;
    avatarSourceMembers.classList.add('hidden');
    avatarSourceOptions.classList.remove('hidden');
    avatarSourceModal.classList.remove('hidden');
};

const openPersona = (key: string) => {
    const deps = getDependencies();
    const persona = deps.getPersona(key);
    if (!persona || key === deps.assistantPersonaKey) return;
    showTargetOptions(`更換 ${persona.name} 的頭像`, { personaKey: key });
};

const openRoomMember = (roomId: string, memberId: string) => {
    const member = getDependencies().getRoomMember(roomId, memberId);
    if (!member) return;
    showTargetOptions(`更換 ${member.persona.name} 的頭像`, { roomId, memberId });
};

const openRoom = (roomId: string) => {
    const deps = getDependencies();
    const room = deps.getRoom(roomId);
    if (!room) return;

    avatarSourceTarget = null;
    avatarSourceTitle.textContent = '選擇要更換頭像的成員';
    avatarSourceOptions.classList.add('hidden');
    avatarSourceMembers.innerHTML = '';

    room.members.forEach(member => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-source-member';

        const avatar = document.createElement('span');
        avatar.className = 'avatar-source-member-avatar';
        const sourcePersona = member.persona.avatarUrl
            ? member.persona
            : member.sourcePersonaKey
                ? deps.getPersona(member.sourcePersonaKey) || member.persona
                : member.persona;
        if (sourcePersona.avatarUrl && !sourcePersona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = sourcePersona.avatarUrl;
            image.alt = member.persona.name;
            avatar.appendChild(image);
        } else {
            avatar.textContent = sourcePersona.emoji || '●';
        }

        const copy = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = member.persona.name;
        const detail = document.createElement('small');
        detail.textContent = '按此選擇本機圖片或搜尋網上公開圖片';
        copy.append(name, detail);
        button.append(avatar, copy);
        button.addEventListener('click', () => openRoomMember(room.id, member.id));
        avatarSourceMembers.appendChild(button);
    });

    avatarSourceMembers.classList.remove('hidden');
    avatarSourceModal.classList.remove('hidden');
};

const close = () => {
    avatarSourceModal.classList.add('hidden');
    avatarSourceTarget = null;
    avatarSourceMembers.classList.add('hidden');
    avatarSourceOptions.classList.remove('hidden');
};

const chooseLocalAvatarSource = () => {
    const target = avatarSourceTarget;
    if (!target) return;
    avatarSourceModal.classList.add('hidden');
    avatarSourceTarget = null;
    pendingLocalUploadTarget = target;
    avatarUploadInput.click();
};

const handleLocalAvatarUpload = async () => {
    const file = avatarUploadInput.files?.[0];
    const target = pendingLocalUploadTarget;
    try {
        if (!file || !target) return;
        const avatarUrl = await optimizeAvatarDataUrl(file);
        await getDependencies().saveLocalAvatar(target, avatarUrl);
        getDependencies().refreshAvatarUi();
    } catch (error) {
        alert(error instanceof Error ? error.message : '頭像更新失敗。');
    } finally {
        pendingLocalUploadTarget = null;
        avatarUploadInput.value = '';
    }
};

const chooseSearchedAvatarSource = async () => {
    const target = avatarSourceTarget;
    if (!target) return;

    const deps = getDependencies();
    const restoreRoomInfo = deps.suspendRoomInfo();
    avatarSourceModal.classList.add('hidden');
    avatarSourceTarget = null;

    const persona = 'personaKey' in target
        ? deps.getPersona(target.personaKey)
        : deps.getRoomMember(target.roomId, target.memberId)?.persona;
    if (!persona) {
        deps.restoreRoomInfo(restoreRoomInfo);
        return;
    }

    const query = persona.publicIdentity
        ? [persona.publicIdentity.canonicalName, persona.publicIdentity.sourceTitle].filter(Boolean).join(' ')
        : [persona.name, persona.description].filter(Boolean).join(' ');
    const result = await deps.resolvePublicIdentity(query);
    if (!result) {
        deps.restoreRoomInfo(restoreRoomInfo);
        return;
    }

    const personaUpdate: Partial<Persona> = {
        publicIdentityEnabled: true,
        publicIdentity: result.identity,
        avatarPrompt: result.identity.visualPrompt,
    };
    if (result.avatarUrl) personaUpdate.avatarUrl = result.avatarUrl;

    if ('personaKey' in target) {
        deps.updatePersona(target.personaKey, personaUpdate);
    } else {
        deps.updateRoomMemberPersona(target.roomId, target.memberId, personaUpdate);
    }

    deps.refreshAvatarUi();
    deps.restoreRoomInfo(restoreRoomInfo);
    if (!result.avatarUrl) {
        alert('身份資料已更新，但你在搜尋畫面選擇了「保留目前頭像」，所以圖片沒有改動。');
    }
};

const setupListeners = () => {
    if (listenersReady) return;
    listenersReady = true;

    closeAvatarSourceModalBtn.addEventListener('click', close);
    avatarSourceModal.addEventListener('click', event => {
        if (event.target === avatarSourceModal) close();
    });
    avatarSourceLocalBtn.addEventListener('click', chooseLocalAvatarSource);
    avatarUploadInput.addEventListener('change', () => {
        void handleLocalAvatarUpload();
    });
    avatarSourceSearchBtn.addEventListener('click', () => {
        void chooseSearchedAvatarSource();
    });
};

export const createAvatarAdminUi = (
    nextDependencies: AvatarAdminUiDependencies,
): AvatarAdminUiHandle => {
    dependencies = nextDependencies;
    setupListeners();
    return {
        openPersona,
        openRoomMember,
        openRoom,
        close,
    };
};
