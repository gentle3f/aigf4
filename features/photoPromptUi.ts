import type { ChatRoom } from '../roomManager.js';

export type PhotoPromptContext = {
    personaKey: string | null;
    personaName: string | null;
    room: ChatRoom | null;
    activeRoomMemberId: string | null;
    assistantMode: boolean;
    godMode: boolean;
};

export type PhotoPromptUiDependencies = {
    getContext: () => PhotoPromptContext;
    selectActiveRoomMember: (memberId: string) => boolean;
    sendPhotoRequest: (input: {
        messageText: string;
        photoSenderMemberId?: string;
        photoSubjectMemberIds?: string[];
    }) => Promise<void>;
    hideMoreOptionsMenu: () => void;
};

export type PhotoPromptUiHandle = {
    open: () => void;
    close: () => void;
};

const photoPromptModal = document.getElementById('photo-prompt-modal')!;
const closePhotoPromptModalBtn = document.getElementById('close-photo-prompt-modal')!;
const photoPromptInput = document.getElementById('photo-prompt-input') as HTMLTextAreaElement;
const photoRoomMemberControls = document.getElementById('photo-room-member-controls')!;
const photoSenderSelect = document.getElementById('photo-sender-select') as HTMLSelectElement;
const photoSubjectsContainer = document.getElementById('photo-subjects-container')!;
const cancelPhotoGeneration = document.getElementById('cancel-photo-generation')!;
const generatePhotoBtn = document.getElementById('generate-photo-btn') as HTMLButtonElement;

let dependencies: PhotoPromptUiDependencies | null = null;
let listenersReady = false;

const getDeps = () => {
    if (!dependencies) throw new Error('Photo Prompt dependencies are not initialized.');
    return dependencies;
};

const close = () => {
    photoPromptModal.classList.add('hidden');
};

const open = () => {
    const deps = getDeps();
    const context = deps.getContext();
    if (!context.personaKey || !context.personaName || context.assistantMode || context.godMode) return;

    photoPromptInput.value = '';
    photoSenderSelect.innerHTML = '';
    photoSubjectsContainer.innerHTML = '';

    if (context.room) {
        photoRoomMemberControls.classList.remove('hidden');
        context.room.members
            .filter(member => context.room!.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.persona.name;
                option.selected = member.id === (context.activeRoomMemberId || context.room!.leadMemberId);
                photoSenderSelect.appendChild(option);

                const label = document.createElement('label');
                label.className = 'photo-subject-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = member.id;
                checkbox.checked = option.selected;
                label.append(checkbox, document.createTextNode(member.persona.name));
                photoSubjectsContainer.appendChild(label);
            });
    } else {
        photoRoomMemberControls.classList.add('hidden');
    }

    photoPromptModal.classList.remove('hidden');
    deps.hideMoreOptionsMenu();
    window.setTimeout(() => photoPromptInput.focus(), 0);
};

const generate = async () => {
    const deps = getDeps();
    const context = deps.getContext();
    const requestText = photoPromptInput.value.trim();
    if (!requestText) {
        photoPromptInput.setCustomValidity('請先描述想收到的照片。');
        photoPromptInput.reportValidity();
        return;
    }

    photoPromptInput.setCustomValidity('');
    const senderMemberId = context.room ? photoSenderSelect.value : undefined;
    const subjectMemberIds = context.room
        ? Array.from(photoSubjectsContainer.querySelectorAll<HTMLInputElement>('input:checked'))
            .map(input => input.value)
        : [];

    if (context.room && (!senderMemberId || subjectMemberIds.length === 0)) {
        alert('請選擇準備照片的人，以及至少 1 位照片中的角色。');
        return;
    }

    if (senderMemberId) deps.selectActiveRoomMember(senderMemberId);
    close();
    await deps.sendPhotoRequest({
        messageText: requestText,
        photoSenderMemberId: senderMemberId,
        photoSubjectMemberIds: subjectMemberIds,
    });
};

const setupListeners = () => {
    if (listenersReady) return;
    listenersReady = true;
    closePhotoPromptModalBtn.addEventListener('click', close);
    cancelPhotoGeneration.addEventListener('click', close);
    generatePhotoBtn.addEventListener('click', () => {
        void generate();
    });
};

export const createPhotoPromptUi = (
    nextDependencies: PhotoPromptUiDependencies,
): PhotoPromptUiHandle => {
    dependencies = nextDependencies;
    setupListeners();
    return { open, close };
};
