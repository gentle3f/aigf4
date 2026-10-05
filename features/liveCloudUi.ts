import type { SupabaseCloudSyncManager, SupabaseCloudSyncState } from '../supabaseCloudSync.js';

const homeMenu = document.getElementById('home-menu')!;
const supabaseCloudModal = document.getElementById('supabase-cloud-modal')!;
const closeSupabaseCloudBtn = document.getElementById('close-supabase-cloud') as HTMLButtonElement;
const supabaseCloudStatusIcon = document.getElementById('supabase-cloud-status-icon')!;
const supabaseCloudStatusTitle = document.getElementById('supabase-cloud-status-title')!;
const supabaseCloudStatusDetail = document.getElementById('supabase-cloud-status-detail')!;
const supabaseCloudProgress = document.getElementById('supabase-cloud-progress')!;
const supabaseCloudProgressText = document.getElementById('supabase-cloud-progress-text')!;
const supabaseCloudProgressPercent = document.getElementById('supabase-cloud-progress-percent')!;
const supabaseCloudProgressBar = document.getElementById('supabase-cloud-progress-bar') as HTMLElement;
const supabaseCloudLogin = document.getElementById('supabase-cloud-login')!;
const supabaseCloudLoginForm = document.getElementById('supabase-cloud-login-form') as HTMLFormElement;
const supabaseCloudEmail = document.getElementById('supabase-cloud-email') as HTMLInputElement;
const supabaseCloudPassword = document.getElementById('supabase-cloud-password') as HTMLInputElement;
const supabaseCloudError = document.getElementById('supabase-cloud-error')!;
const supabaseCloudPasswordLogin = document.getElementById('supabase-cloud-password-login') as HTMLButtonElement;
const supabaseCloudSendLink = document.getElementById('supabase-cloud-send-link') as HTMLButtonElement;
const supabaseCloudControls = document.getElementById('supabase-cloud-controls')!;
const supabaseCloudAccount = document.getElementById('supabase-cloud-account')!;
const supabaseCloudSyncNow = document.getElementById('supabase-cloud-sync-now') as HTMLButtonElement;
const supabaseCloudReload = document.getElementById('supabase-cloud-reload') as HTMLButtonElement;
const supabaseCloudNewPassword = document.getElementById('supabase-cloud-new-password') as HTMLInputElement;
const supabaseCloudNewPasswordConfirm = document.getElementById('supabase-cloud-new-password-confirm') as HTMLInputElement;
const supabaseCloudControlsError = document.getElementById('supabase-cloud-controls-error')!;
const supabaseCloudSetPassword = document.getElementById('supabase-cloud-set-password') as HTMLButtonElement;
const supabaseCloudSignOut = document.getElementById('supabase-cloud-sign-out') as HTMLButtonElement;

let supabaseCloudSyncManager: SupabaseCloudSyncManager;
let listenersAttached = false;
const formatLiveCloudTime = (timestamp?: number) => timestamp
    ? new Intl.DateTimeFormat('zh-HK', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp))
    : '';

function renderSupabaseCloudState(state: SupabaseCloudSyncState) {
    const busy = ['sending_link', 'connecting', 'pulling', 'pushing'].includes(state.phase);
    const signedIn = Boolean(state.email);
    const titles: Record<SupabaseCloudSyncState['phase'], string> = {
        unconfigured: '即時雲端尚未設定',
        signed_out: '尚未登入即時雲端',
        sending_link: '正在傳送登入連結',
        connecting: '正在連接私人雲端',
        pulling: '正在下載最新資料',
        pushing: '正在上傳本機變更',
        synced: '即時雲端已同步',
        offline: '目前使用離線快取',
        error: '即時雲端需要處理',
    };
    supabaseCloudStatusTitle.textContent = titles[state.phase];
    supabaseCloudStatusDetail.textContent = state.lastSyncAt && state.phase === 'synced'
        ? `${state.detail} 最近同步：${formatLiveCloudTime(state.lastSyncAt)}`
        : state.detail;
    supabaseCloudStatusIcon.className = 'cloud-backup-status-icon';
    if (state.phase === 'error') {
        supabaseCloudStatusIcon.textContent = '!';
        supabaseCloudStatusIcon.classList.add('is-error');
    } else if (state.phase === 'synced') {
        supabaseCloudStatusIcon.textContent = '✓';
    } else if (state.phase === 'pulling') {
        supabaseCloudStatusIcon.textContent = '↓';
        supabaseCloudStatusIcon.classList.add('is-warning');
    } else if (state.phase === 'pushing') {
        supabaseCloudStatusIcon.textContent = '↑';
        supabaseCloudStatusIcon.classList.add('is-warning');
    } else {
        supabaseCloudStatusIcon.textContent = '↥';
        supabaseCloudStatusIcon.classList.add('is-warning');
    }

    supabaseCloudLogin.classList.toggle('hidden', signedIn);
    supabaseCloudControls.classList.toggle('hidden', !signedIn);
    supabaseCloudAccount.textContent = state.email || '';
    supabaseCloudError.textContent = state.phase === 'error' ? state.detail : '';
    supabaseCloudPasswordLogin.disabled = busy || !state.configured;
    supabaseCloudSendLink.disabled = busy || !state.configured;
    supabaseCloudSyncNow.disabled = busy;
    supabaseCloudReload.disabled = busy;
    supabaseCloudSetPassword.disabled = busy;
    supabaseCloudSignOut.disabled = busy;
    supabaseCloudProgress.classList.toggle('hidden', !busy);
    supabaseCloudProgressText.textContent = state.detail;
    supabaseCloudProgressPercent.textContent = typeof state.progress === 'number' ? `${state.progress}%` : '';
    supabaseCloudProgressBar.style.width = `${state.progress ?? (busy ? 12 : 0)}%`;
}

const openSupabaseCloud = () => {
    homeMenu.classList.add('hidden');
    supabaseCloudEmail.value = supabaseCloudSyncManager.getOwnerEmail();
    renderSupabaseCloudState(supabaseCloudSyncManager.getState());
    supabaseCloudModal.classList.remove('hidden');
};

const closeSupabaseCloud = () => supabaseCloudModal.classList.add('hidden');

const signInSupabaseCloudWithPassword = async () => {
    supabaseCloudError.textContent = '';
    try {
        await supabaseCloudSyncManager.signInWithPassword(
            supabaseCloudEmail.value,
            supabaseCloudPassword.value,
        );
        supabaseCloudPassword.value = '';
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '密碼登入失敗。';
    }
};

const sendSupabaseMagicLink = async () => {
    supabaseCloudError.textContent = '';
    try {
        await supabaseCloudSyncManager.sendMagicLink(supabaseCloudEmail.value);
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '未能傳送登入連結。';
    }
};

const setSupabaseCloudPassword = async () => {
    supabaseCloudControlsError.textContent = '';
    const password = supabaseCloudNewPassword.value;
    if (password.length < 8) {
        supabaseCloudControlsError.textContent = '雲端密碼至少需要 8 個字元。';
        supabaseCloudNewPassword.focus();
        return;
    }
    if (password !== supabaseCloudNewPasswordConfirm.value) {
        supabaseCloudControlsError.textContent = '兩次輸入的雲端密碼不同。';
        supabaseCloudNewPasswordConfirm.focus();
        return;
    }
    try {
        await supabaseCloudSyncManager.setPassword(password);
        supabaseCloudNewPassword.value = '';
        supabaseCloudNewPasswordConfirm.value = '';
    } catch (error) {
        supabaseCloudControlsError.textContent = error instanceof Error ? error.message : '未能設定雲端密碼。';
    }
};

const syncSupabaseCloudNow = async () => {
    try {
        await supabaseCloudSyncManager.syncNow();
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '同步失敗。';
    }
};

const reloadSupabaseCloud = async () => {
    if (!confirm('會先上傳尚未同步的本機變更，再重新載入雲端最新資料。繼續嗎？')) return;
    try {
        await supabaseCloudSyncManager.reloadFromCloud();
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '重新載入失敗。';
    }
};

const signOutSupabaseCloud = async () => {
    try {
        await supabaseCloudSyncManager.signOut();
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '登出失敗。';
    }
};

export type LiveCloudUiHandle = {
    open: () => void;
    renderState: (state: SupabaseCloudSyncState) => void;
};

export const createLiveCloudUi = (manager: SupabaseCloudSyncManager): LiveCloudUiHandle => {
    supabaseCloudSyncManager = manager;
    if (!listenersAttached) {
        closeSupabaseCloudBtn.addEventListener('click', closeSupabaseCloud);
        supabaseCloudModal.addEventListener('click', event => {
            if (event.target === supabaseCloudModal) closeSupabaseCloud();
        });
        supabaseCloudLoginForm.addEventListener('submit', event => {
            event.preventDefault();
            void signInSupabaseCloudWithPassword();
        });
        supabaseCloudSendLink.addEventListener('click', () => void sendSupabaseMagicLink());
        supabaseCloudSyncNow.addEventListener('click', () => void syncSupabaseCloudNow());
        supabaseCloudReload.addEventListener('click', () => void reloadSupabaseCloud());
        supabaseCloudSetPassword.addEventListener('click', () => void setSupabaseCloudPassword());
        supabaseCloudNewPasswordConfirm.addEventListener('keydown', event => {
            if (event.key === 'Enter') void setSupabaseCloudPassword();
        });
        supabaseCloudSignOut.addEventListener('click', () => void signOutSupabaseCloud());
        listenersAttached = true;
    }
    return {
        open: openSupabaseCloud,
        renderState: renderSupabaseCloudState,
    };
};