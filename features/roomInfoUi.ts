import type { Persona } from '../managers.js';
import { normalizeGroupRoomTitle } from '../groupRoomTitle.js';
import { isGroupMemberDisplayNameAvailable, normalizeGroupMemberDisplayName } from '../groupMemberDisplayName.js';
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
    canRenameMember: () => boolean;
    onMemberRenamed: () => void;
    onRoomRenamed: () => void;
    isGroupV2Enabled: (roomId: string) => boolean;
    setGroupV2Enabled: (roomId: string, enabled: boolean) => void;
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
    const renameRoomButton = document.createElement('button');
    renameRoomButton.type = 'button';
    renameRoomButton.className = 'room-member-mini-action room-title-rename-button';
    renameRoomButton.textContent = '修改群組名稱';
    renameRoomButton.setAttribute('aria-label', '修改群組名稱');
    renameRoomButton.addEventListener('click', () => {
        if (!dependencies.canRenameMember()) {
            alert('請等待目前回覆完成，再修改群組名稱。');
            return;
        }
        const requested = window.prompt('修改群組名稱', room.title);
        if (requested === null) return;
        const title = normalizeGroupRoomTitle(requested);
        if (!title) {
            alert('群組名稱不可留空、超過 48 字或包含控制符號。');
            return;
        }
        if (title === room.title) return;
        try {
            const saved = dependencies.updateRoom(room.id, draft => { draft.title = title; });
            if (!saved) throw new Error('未能儲存群組名稱。');
            dependencies.onRoomRenamed();
            renderRoomInfo();
        } catch (error) {
            alert(error instanceof Error ? error.message : '未能修改群組名稱。');
        }
    });
    roomInfoTitle.appendChild(renameRoomButton);
    roomInfoSummary.textContent = `${room.members.length} 位固定成員 · ${room.scene.presentMemberIds.length} 位目前在場 · 最多 ${ROOM_MEMBER_LIMIT} 位`;
    const modeControl = document.createElement('div');
    modeControl.className = 'group-engine-mode-control';
    const modeLabel = document.createElement('strong');
    modeLabel.textContent = '群聊引擎';
    const modeOptions = document.createElement('div');
    modeOptions.className = 'group-engine-mode-options';
    const isV2 = dependencies.isGroupV2Enabled(room.id);
    ([
        { mode: 'v1', label: '經典 V1', enabled: !isV2 },
        { mode: 'v2', label: '實驗 V2', enabled: isV2 },
    ] as const).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'room-member-mini-action group-engine-mode-button';
        button.textContent = option.label;
        button.setAttribute('aria-pressed', String(option.enabled));
        if (option.enabled) button.classList.add('is-selected');
        button.addEventListener('click', () => {
            if (!dependencies.canRenameMember()) {
                alert('請等待目前回覆完成後再切換引擎。');
                return;
            }
            const next = option.mode === 'v2';
            if (dependencies.isGroupV2Enabled(room.id) === next) return;
            try {
                dependencies.setGroupV2Enabled(room.id, next);
                renderRoomInfo();
            } catch {
                alert('切換未能儲存；請檢查本機瀏覽器設定。');
            }
        });
        modeOptions.appendChild(button);
    });
    const modeHint = document.createElement('small');
    modeHint.textContent = '只影響此群組之後的新回覆；選擇會透過現有 Supabase 設定同步至其他裝置，不會更改舊對話。';
    modeControl.append(modeLabel, modeOptions, modeHint);
    roomInfoSummary.appendChild(modeControl);
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

        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.className = 'room-member-mini-action';
        renameButton.textContent = '改名';
        renameButton.setAttribute('aria-label', `修改 ${member.persona.name} 的群組顯示名稱`);
        renameButton.addEventListener('click', () => {
            if (!dependencies.canRenameMember()) {
                alert('請等待目前回覆完成，再修改顯示名稱。');
                return;
            }
            const requested = window.prompt('修改此群組的顯示名稱（不影響 Wikipedia 身份）', member.persona.name);
            if (requested === null) return;
            const nextName = normalizeGroupMemberDisplayName(requested);
            if (!nextName) {
                alert('名稱不可留空、超過 32 字或包含對話格式符號。');
                return;
            }
            const current = dependencies.getRoom();
            if (!current || !current.members.some(item => item.id === member.id)) return;
            if (!isGroupMemberDisplayNameAvailable(
                nextName,
                current.members.filter(item => item.id !== member.id).map(item => item.persona.name),
            )) {
                alert(`群組已有「${nextName}」，請使用不同名稱。`);
                return;
            }
            if (nextName === member.persona.name) return;
            try {
                const saved = dependencies.updateRoom(room.id, editableRoom => {
                    const target = editableRoom.members.find(item => item.id === member.id);
                    if (target) target.persona.name = nextName;
                });
                if (!saved) throw new Error('未能儲存群組顯示名稱。');
                dependencies.onMemberRenamed();
                renderRoomInfo();
            } catch (error) {
                alert(error instanceof Error ? error.message : '未能修改顯示名稱。');
            }
        });

        const goalButton = document.createElement('button');
        goalButton.type = 'button';
        goalButton.className = 'room-member-mini-action';
        goalButton.textContent = '自主目標';
        goalButton.title = '可選：設定角色持續想做的事；留空即交由故事場景與記憶推動';
        goalButton.addEventListener('click', () => {
            if (!dependencies.canRenameMember()) {
                alert('請等待目前回覆完成，再修改角色目標。');
                return;
            }
            const existing = room.agencyGoals?.[member.id] || '';
            const entered = window.prompt(`${member.persona.name} 想主動做甚麼？留空清除，唔需要替角色安排每個動作。`, existing);
            if (entered === null) return;
            const goal = entered.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
            if (goal.length > 240 || /[<>]/u.test(goal)) {
                alert('自主目標最多 240 字，不能包含控制符號。');
                return;
            }
            dependencies.updateRoom(room.id, editableRoom => {
                editableRoom.agencyGoals ||= {};
                if (goal) editableRoom.agencyGoals[member.id] = goal;
                else delete editableRoom.agencyGoals[member.id];
            });
            dependencies.refreshRoom();
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
        actions.append(renameButton, goalButton, dmButton, avatarButton, presence);
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
