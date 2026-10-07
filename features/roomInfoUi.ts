import type { Persona } from '../managers.js';
import { FAVORITE_PHOTO_PROMPT_MAX_LENGTH, normalizeFavoritePhotoPrompt } from '../photoPromptPreference.js';
import { ROOM_MEMBER_LIMIT } from '../roomManager.js';
import type { ChatRoom, RoomManager, RoomSceneState } from '../roomManager.js';

export type RoomInfoUiDependencies = {
    getRoom: () => ChatRoom | null;
    getSourcePersona: (personaKey: string) => Persona | undefined;
    selectMember: (memberId: string) => boolean;
    openPersonaSettingsForMember: (roomId: string, memberId: string) => void;
    requestMemberAvatar: (roomId: string, memberId: string) => void;
    openPrivateChat: (roomId: string, memberId: string) => Promise<void>;
    setMemberPresence: (roomId: string, memberId: string, present: boolean) => boolean | Promise<boolean>;
    updateRoom: RoomManager['updateRoom'];
    refreshRoom: () => ChatRoom | null;
    getActiveMemberId: () => string | null;
    openPersonaSettingsFallback: () => void;
    hideMoreOptionsMenu: () => void;
};

const roomInfoModal = document.getElementById('room-info-modal')!;
const closeRoomInfoBtn = document.getElementById('close-room-info') as HTMLButtonElement;
const roomInfoTitle = document.getElementById('room-info-title')!;
const roomInfoSummary = document.getElementById('room-info-summary')!;
const roomMemberList = document.getElementById('room-member-list')!;
const roomSceneEditor = document.getElementById('room-scene-editor')!;
const roomPhotoPromptEditor = document.getElementById('room-photo-prompt-editor')!;

let activeDependencies: RoomInfoUiDependencies | null = null;

const renderRoomInfo = () => {
    const dependencies = activeDependencies;
    if (!dependencies) return;
    const room = dependencies.getRoom();
    if (!room) return;
    const activeRoomMemberId = dependencies.getActiveMemberId();

    roomInfoTitle.textContent = room.title;
    roomInfoSummary.textContent = `${room.members.length} 位固定成員 · ${room.scene.presentMemberIds.length} 位目前在場 · 最多 ${ROOM_MEMBER_LIMIT} 位`;
    roomMemberList.innerHTML = '';

    room.members.forEach(member => {
        const row = document.createElement('div');
        row.className = `room-member-row${member.id === activeRoomMemberId ? ' is-active' : ''}`;
        const avatar = document.createElement('span');
        avatar.className = 'room-member-avatar';
        const sourcePersona = member.persona.avatarUrl
            ? member.persona
            : member.sourcePersonaKey
                ? dependencies.getSourcePersona(member.sourcePersonaKey) || member.persona
                : member.persona;
        if (sourcePersona.avatarUrl && !sourcePersona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = sourcePersona.avatarUrl;
            image.alt = sourcePersona.name;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.fetchPriority = 'low';
            avatar.appendChild(image);
        } else {
            avatar.textContent = sourcePersona.emoji || '●';
        }

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'room-member-copy';
        const name = document.createElement('strong');
        name.textContent = member.persona.name;
        const detail = document.createElement('span');
        detail.textContent = member.persona.publicIdentityEnabled
            ? `已確認身份 · ${member.persona.description}`
            : member.persona.description;
        copy.append(name, detail);
        copy.addEventListener('click', () => {
            if (!dependencies.selectMember(member.id)) return;
            dependencies.openPersonaSettingsForMember(room.id, member.id);
            renderRoomInfo();
        });

        const avatarButton = document.createElement('button');
        avatarButton.type = 'button';
        avatarButton.className = 'room-member-mini-action';
        avatarButton.textContent = '頭像';
        avatarButton.addEventListener('click', () => dependencies.requestMemberAvatar(room.id, member.id));

        const dmButton = document.createElement('button');
        dmButton.type = 'button';
        dmButton.className = 'room-member-mini-action';
        dmButton.textContent = '私訊';
        dmButton.addEventListener('click', async () => {
            dmButton.disabled = true;
            try {
                await dependencies.openPrivateChat(room.id, member.id);
            } catch (error) {
                alert(error instanceof Error ? error.message : '未能開啟私人聊天。');
                dmButton.disabled = false;
            }
        });

        const presence = document.createElement('label');
        presence.className = 'room-presence-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = room.scene.presentMemberIds.includes(member.id);
        const label = document.createElement('span');
        label.textContent = '在場';
        presence.append(checkbox, label);
        checkbox.addEventListener('change', async () => {
            const requestedState = checkbox.checked;
            try {
                const applied = await dependencies.setMemberPresence(room.id, member.id, requestedState);
                const refreshedRoom = dependencies.getRoom();
                const actualState = Boolean(
                    refreshedRoom?.scene.presentMemberIds.includes(member.id),
                );
                checkbox.checked = actualState;
                if (!applied && actualState !== requestedState) {
                    checkbox.setAttribute('aria-invalid', 'true');
                    window.setTimeout(() => checkbox.removeAttribute('aria-invalid'), 500);
                }
                if (refreshedRoom) {
                    roomInfoSummary.textContent = `${refreshedRoom.members.length} 位固定成員 · ${refreshedRoom.scene.presentMemberIds.length} 位目前在場 · 最多 ${ROOM_MEMBER_LIMIT} 位`;
                }
            } catch (error) {
                const refreshedRoom = dependencies.getRoom();
                checkbox.checked = Boolean(
                    refreshedRoom?.scene.presentMemberIds.includes(member.id),
                );
                alert(error instanceof Error ? error.message : '未能更新角色在場狀態。');
            }
        });

        const actions = document.createElement('div');
        actions.className = 'room-member-actions';
        actions.append(dmButton, avatarButton, presence);
        row.append(avatar, copy, actions);
        roomMemberList.appendChild(row);
    });

    roomSceneEditor.innerHTML = '';
    const locationLabel = document.createElement('label');
    locationLabel.className = 'wa-field-label';
    locationLabel.textContent = '位置';
    const locationInput = document.createElement('input');
    locationInput.value = room.scene.location;
    locationLabel.appendChild(locationInput);

    const realityLabel = document.createElement('label');
    realityLabel.className = 'wa-field-label';
    realityLabel.textContent = '對話層';
    const realitySelect = document.createElement('select');
    [
        ['physical', '同一實體場景'],
        ['texting', '遠端訊息'],
        ['imagined', '想像／故事中'],
    ].forEach(([value, labelText]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelText;
        option.selected = room.scene.realityLayer === value;
        realitySelect.appendChild(option);
    });
    realityLabel.appendChild(realitySelect);

    const summaryLabel = document.createElement('label');
    summaryLabel.className = 'wa-field-label';
    summaryLabel.textContent = '場景摘要';
    const summaryInput = document.createElement('textarea');
    summaryInput.rows = 4;
    summaryInput.value = room.scene.summary;
    summaryLabel.appendChild(summaryInput);

    const saveScene = document.createElement('button');
    saveScene.type = 'button';
    saveScene.className = 'wa-secondary-button';
    saveScene.textContent = '儲存場景狀態';
    saveScene.addEventListener('click', () => {
        dependencies.updateRoom(room.id, editableRoom => {
            editableRoom.scene.location = locationInput.value.trim() || editableRoom.scene.location;
            editableRoom.scene.realityLayer = realitySelect.value as RoomSceneState['realityLayer'];
            editableRoom.scene.summary = summaryInput.value.trim() || editableRoom.scene.summary;
        });
        dependencies.refreshRoom();
        saveScene.textContent = '已儲存';
        window.setTimeout(() => { saveScene.textContent = '儲存場景狀態'; }, 1200);
    });
    roomSceneEditor.append(locationLabel, realityLabel, summaryLabel, saveScene);

    roomPhotoPromptEditor.innerHTML = '';
    const favoritePromptInput = document.createElement('textarea');
    favoritePromptInput.rows = 4;
    favoritePromptInput.maxLength = FAVORITE_PHOTO_PROMPT_MAX_LENGTH;
    favoritePromptInput.value = room.favoritePhotoPrompt || '';
    favoritePromptInput.placeholder = '例如：自然手機攝影、柔和窗光、保留真實皮膚質感，不要文字或浮水印。';
    const favoritePromptHint = document.createElement('p');
    favoritePromptHint.textContent = '角色會先把這段設定與當下衣著、位置、動作及最新拍照要求整合成不矛盾的版本；每次照片草稿仍可取消勾選。';
    const saveFavoritePrompt = document.createElement('button');
    saveFavoritePrompt.type = 'button';
    saveFavoritePrompt.className = 'wa-secondary-button';
    saveFavoritePrompt.textContent = '儲存常用拍照 Prompt';
    saveFavoritePrompt.addEventListener('click', () => {
        dependencies.updateRoom(room.id, editableRoom => {
            editableRoom.favoritePhotoPrompt = normalizeFavoritePhotoPrompt(favoritePromptInput.value);
        });
        const refreshed = dependencies.refreshRoom();
        favoritePromptInput.value = refreshed?.favoritePhotoPrompt || '';
        saveFavoritePrompt.textContent = '已儲存';
        window.setTimeout(() => { saveFavoritePrompt.textContent = '儲存常用拍照 Prompt'; }, 1200);
    });
    roomPhotoPromptEditor.append(favoritePromptInput, favoritePromptHint, saveFavoritePrompt);
};

export const openRoomInfo = (dependencies: RoomInfoUiDependencies) => {
    activeDependencies = dependencies;
    if (!dependencies.getRoom()) {
        dependencies.openPersonaSettingsFallback();
        return;
    }
    renderRoomInfo();
    roomInfoModal.classList.remove('hidden');
    dependencies.hideMoreOptionsMenu();
};

export const refreshRoomInfo = (dependencies: RoomInfoUiDependencies) => {
    activeDependencies = dependencies;
    renderRoomInfo();
};

const closeRoomInfo = () => roomInfoModal.classList.add('hidden');
closeRoomInfoBtn.addEventListener('click', closeRoomInfo);
