import type { MemoryManager } from '../managers.js';
import type { CloudBackupListItem, CloudBackupManager, CloudBackupProgress } from '../cloudBackup.js';
import { listCharacterPhotoAssets } from '../photoStore.js';

const homeMenu = document.getElementById('home-menu')!;
const cloudBackupModal = document.getElementById('cloud-backup-modal')!;
const closeCloudBackupBtn = document.getElementById('close-cloud-backup') as HTMLButtonElement;
const cloudBackupStatusIcon = document.getElementById('cloud-backup-status-icon')!;
const cloudBackupStatusTitle = document.getElementById('cloud-backup-status-title')!;
const cloudBackupStatusDetail = document.getElementById('cloud-backup-status-detail')!;
const cloudBackupProgress = document.getElementById('cloud-backup-progress')!;
const cloudBackupProgressText = document.getElementById('cloud-backup-progress-text')!;
const cloudBackupProgressPercent = document.getElementById('cloud-backup-progress-percent')!;
const cloudBackupProgressBar = document.getElementById('cloud-backup-progress-bar') as HTMLElement;
const scanLocalPhotoVaultBtn = document.getElementById('scan-local-photo-vault') as HTMLButtonElement;
const localPhotoVaultResult = document.getElementById('local-photo-vault-result')!;
const cloudBackupSetup = document.getElementById('cloud-backup-setup')!;
const cloudBackupPassword = document.getElementById('cloud-backup-password') as HTMLInputElement;
const cloudBackupPasswordConfirm = document.getElementById('cloud-backup-password-confirm') as HTMLInputElement;
const cloudBackupSetupError = document.getElementById('cloud-backup-setup-error')!;
const enableCloudBackupBtn = document.getElementById('enable-cloud-backup') as HTMLButtonElement;
const cloudBackupRecovery = document.getElementById('cloud-backup-recovery')!;
const cloudRestorePassword = document.getElementById('cloud-restore-password') as HTMLInputElement;
const cloudRestoreError = document.getElementById('cloud-restore-error')!;
const restoreCloudWithPasswordBtn = document.getElementById('restore-cloud-with-password') as HTMLButtonElement;
const cloudBackupControls = document.getElementById('cloud-backup-controls')!;
const cloudBackupAutoToggle = document.getElementById('cloud-backup-auto-toggle') as HTMLInputElement;
const cloudBackupNowBtn = document.getElementById('cloud-backup-now') as HTMLButtonElement;
const cloudRestoreLatestBtn = document.getElementById('cloud-restore-latest') as HTMLButtonElement;
const cloudBackupVersionsSection = document.getElementById('cloud-backup-versions-section')!;
const cloudBackupVersionList = document.getElementById('cloud-backup-version-list')!;
const refreshCloudBackupsBtn = document.getElementById('refresh-cloud-backups') as HTMLButtonElement;
const cloudBackupDanger = document.getElementById('cloud-backup-danger')!;
const deleteCloudBackupsBtn = document.getElementById('delete-cloud-backups') as HTMLButtonElement;

let cloudBackupManager: CloudBackupManager;
let memoryManager: MemoryManager;
let cloudBackupList: CloudBackupListItem[] = [];
let cloudBackupHasLocalKey = false;
let cloudBackupBusy = false;
let cloudBackupLastProgress: CloudBackupProgress = {
    stage: 'idle',
    message: '尚未開始雲端備份。',
};
let listenersAttached = false;
const formatCloudBackupBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
};

const formatCloudBackupTime = (value: number | string) => new Date(value).toLocaleString('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const setCloudBackupBusy = (busy: boolean) => {
    cloudBackupBusy = busy;
    [
        enableCloudBackupBtn,
        restoreCloudWithPasswordBtn,
        cloudBackupNowBtn,
        cloudRestoreLatestBtn,
        refreshCloudBackupsBtn,
        deleteCloudBackupsBtn,
        scanLocalPhotoVaultBtn,
    ].forEach(button => { button.disabled = busy; });
    cloudBackupAutoToggle.disabled = busy;
};

function renderCloudBackupProgress(progress: CloudBackupProgress) {
    cloudBackupLastProgress = progress;
    const active = ['packing', 'encrypting', 'uploading', 'restoring'].includes(progress.stage);
    setCloudBackupBusy(active);
    cloudBackupProgress.classList.toggle('hidden', progress.stage === 'idle');
    cloudBackupProgressText.textContent = progress.message;
    cloudBackupProgressPercent.textContent = typeof progress.percent === 'number' ? `${progress.percent}%` : '';
    cloudBackupProgressBar.style.width = `${progress.percent ?? (active ? 8 : progress.stage === 'success' ? 100 : 0)}%`;
    if (progress.stage === 'success') {
        window.setTimeout(() => {
            if (cloudBackupLastProgress.stage === 'success') {
                cloudBackupProgress.classList.add('hidden');
                cloudBackupLastProgress = { stage: 'idle', message: '尚未開始雲端備份。' };
            }
        }, 3500);
        void refreshCloudBackupView(true);
    }
}

const renderCloudBackupVersions = () => {
    cloudBackupVersionList.innerHTML = '';
    if (cloudBackupList.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'cloud-backup-empty';
        empty.textContent = '雲端尚未有備份。';
        cloudBackupVersionList.appendChild(empty);
        return;
    }

    cloudBackupList.forEach((backup, index) => {
        const row = document.createElement('div');
        row.className = 'cloud-backup-version-row';
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = `${index === 0 ? '最新 · ' : ''}${formatCloudBackupTime(backup.uploadedAt)}`;
        const details = document.createElement('small');
        details.textContent = `${formatCloudBackupBytes(backup.size)} · 已加密`;
        copy.append(title, details);
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = '還原';
        restore.disabled = cloudBackupBusy;
        restore.addEventListener('click', () => {
            if (!cloudBackupHasLocalKey) {
                cloudBackupRecovery.classList.remove('hidden');
                cloudRestorePassword.focus();
                return;
            }
            void restoreCloudBackupVersion(backup);
        });
        row.append(copy, restore);
        cloudBackupVersionList.appendChild(row);
    });
};

const renderCloudBackupState = () => {
    const state = cloudBackupManager.getState();
    const hasRemoteBackup = cloudBackupList.length > 0;
    cloudBackupSetup.classList.toggle('hidden', cloudBackupHasLocalKey);
    cloudBackupRecovery.classList.toggle('hidden', cloudBackupHasLocalKey);
    cloudBackupControls.classList.toggle('hidden', !cloudBackupHasLocalKey);
    cloudBackupVersionsSection.classList.toggle('hidden', !hasRemoteBackup && !cloudBackupHasLocalKey);
    cloudBackupDanger.classList.toggle('hidden', !hasRemoteBackup && !cloudBackupHasLocalKey);
    cloudBackupAutoToggle.checked = state.enabled && cloudBackupHasLocalKey;

    cloudBackupStatusIcon.className = 'cloud-backup-status-icon';
    if (state.lastError) {
        cloudBackupStatusIcon.textContent = '!';
        cloudBackupStatusIcon.classList.add('is-error');
        cloudBackupStatusTitle.textContent = '上次雲端操作失敗';
        cloudBackupStatusDetail.textContent = state.lastError;
    } else if (!cloudBackupHasLocalKey) {
        cloudBackupStatusIcon.textContent = hasRemoteBackup ? '↧' : '＋';
        cloudBackupStatusIcon.classList.add('is-warning');
        cloudBackupStatusTitle.textContent = hasRemoteBackup ? '找到可復原的加密備份' : '這部裝置尚未連接雲端';
        cloudBackupStatusDetail.textContent = hasRemoteBackup
            ? '已找到這個復原密碼的私人備份，可以立即還原。'
            : '可建立新的私人備份，或輸入原有復原密碼找回資料。';
    } else if (state.lastBackupAt && hasRemoteBackup) {
        cloudBackupStatusIcon.textContent = '✓';
        cloudBackupStatusTitle.textContent = state.enabled ? '自動備份已開啟' : '雲端備份已暫停';
        cloudBackupStatusDetail.textContent = [
            `最近備份：${formatCloudBackupTime(state.lastBackupAt)}`,
            formatCloudBackupBytes(state.lastBackupSize),
            typeof state.lastBackupPhotoCount === 'number' ? `聊天相片 ${state.lastBackupPhotoCount} 張` : '',
        ].filter(Boolean).join(' · ');
    } else if (cloudBackupHasLocalKey) {
        cloudBackupStatusIcon.textContent = '↑';
        cloudBackupStatusIcon.classList.add('is-warning');
        cloudBackupStatusTitle.textContent = '金鑰已準備，尚未完成上傳';
        cloudBackupStatusDetail.textContent = '按「立即備份」建立第一個加密雲端版本。';
    }
    renderCloudBackupVersions();
};

async function refreshCloudBackupView(fetchRemote = true) {
    try {
        cloudBackupHasLocalKey = await cloudBackupManager.hasLocalRecoveryKey();
        if (fetchRemote) cloudBackupList = await cloudBackupManager.listBackups();
    } catch (error) {
        cloudBackupStatusIcon.textContent = '!';
        cloudBackupStatusIcon.className = 'cloud-backup-status-icon is-error';
        cloudBackupStatusTitle.textContent = '無法讀取雲端備份';
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '請稍後再試。';
    }
    renderCloudBackupState();
}

async function scanLocalPhotoVault(showWorking = true) {
    if (showWorking) localPhotoVaultResult.textContent = '正在掃描本機照片庫…';
    scanLocalPhotoVaultBtn.disabled = true;
    try {
        const assets = await listCharacterPhotoAssets();
        const referencedIds = new Set(
            Object.values(memoryManager.getAllChatHistories())
                .flatMap(history => history.map(message => message.content.imageAssetId))
                .filter((assetId): assetId is string => Boolean(assetId)),
        );
        const orphanAssets = assets.filter(asset => !referencedIds.has(asset.id));
        const ccKeys = new Set([
            'cc',
            'custom_seed_cc',
            ...Object.entries(memoryManager.getAllPersonas())
                .filter(([, persona]) => persona.name.trim().toLocaleLowerCase() === 'cc')
                .map(([key]) => key),
        ]);
        const ccAssets = assets.filter(asset => ccKeys.has(asset.personaKey));
        const ccOrphans = ccAssets.filter(asset => !referencedIds.has(asset.id));
        localPhotoVaultResult.textContent = [
            `找到 ${assets.length} 張實體照片`,
            `${orphanAssets.length} 張失去聊天索引`,
            `Cc 共 ${ccAssets.length} 張（其中 ${ccOrphans.length} 張待救回）`,
            '待救回照片現在會直接顯示在所屬聊天室的「媒體」相簿，下一次備份亦會完整打包。',
        ].join('；');
    } catch (error) {
        localPhotoVaultResult.textContent = `掃描失敗：${error instanceof Error ? error.message : '無法讀取本機照片資料庫'}`;
    } finally {
        scanLocalPhotoVaultBtn.disabled = cloudBackupBusy;
    }
}

const openCloudBackup = () => {
    cloudBackupSetupError.textContent = '';
    cloudRestoreError.textContent = '';
    cloudBackupModal.classList.remove('hidden');
    homeMenu.classList.add('hidden');
    void refreshCloudBackupView(true);
    void scanLocalPhotoVault(false);
};

const closeCloudBackup = () => cloudBackupModal.classList.add('hidden');

const setupCloudBackup = async () => {
    cloudBackupSetupError.textContent = '';
    const password = cloudBackupPassword.value;
    if (password.normalize('NFKC').trim().length < 12) {
        cloudBackupSetupError.textContent = '復原密碼至少需要 12 個字元。';
        cloudBackupPassword.focus();
        return;
    }
    if (password !== cloudBackupPasswordConfirm.value) {
        cloudBackupSetupError.textContent = '兩次輸入的復原密碼不同。';
        cloudBackupPasswordConfirm.focus();
        return;
    }

    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.setup(password);
        cloudBackupPassword.value = '';
        cloudBackupPasswordConfirm.value = '';
        cloudBackupHasLocalKey = true;
        await refreshCloudBackupView(true);
    } catch (error) {
        const message = error instanceof Error ? error.message : '首次備份失敗。';
        if (message === 'CLOUD_BACKUP_EXISTS') {
            cloudBackupSetupError.textContent = '這個復原密碼已有雲端備份，請在下方使用「從雲端復原」，避免覆蓋原資料。';
            cloudRestorePassword.focus();
        } else {
            cloudBackupSetupError.textContent = message;
        }
    } finally {
        setCloudBackupBusy(false);
    }
};

async function restoreCloudBackupVersion(backup: CloudBackupListItem, password?: string) {
    if (!confirm(
        `以 ${formatCloudBackupTime(backup.uploadedAt)} 的完整雲端備份取代這部裝置的本機副本？\n\n雲端版本不會被修改；自動備份會維持目前的開關狀態。`,
    )) return;
    cloudRestoreError.textContent = '';
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.restoreBackup(backup, password);
        cloudRestorePassword.value = '';
        cloudBackupHasLocalKey = true;
        await refreshCloudBackupView(true);
    } catch (error) {
        const message = error instanceof Error ? error.message : '雲端還原失敗。';
        cloudRestoreError.textContent = message === 'NEEDS_RECOVERY_PASSWORD'
            ? '請先輸入原本的復原密碼。'
            : message;
        cloudBackupRecovery.classList.remove('hidden');
        cloudRestorePassword.focus();
    } finally {
        setCloudBackupBusy(false);
    }
};

const restoreLatestCloudBackupWithPassword = async () => {
    const password = cloudRestorePassword.value;
    if (!password) {
        cloudRestoreError.textContent = '請輸入復原密碼。';
        cloudRestorePassword.focus();
        return;
    }
    cloudRestoreError.textContent = '';
    setCloudBackupBusy(true);
    try {
        cloudBackupList = await cloudBackupManager.listBackups(password);
        const latest = cloudBackupList[0];
        if (!latest) {
            cloudRestoreError.textContent = '找不到這個復原密碼所屬的備份，請檢查密碼是否正確。';
            renderCloudBackupState();
            return;
        }
        renderCloudBackupState();
        await restoreCloudBackupVersion(latest, password);
    } catch (error) {
        cloudRestoreError.textContent = error instanceof Error ? error.message : '無法讀取雲端備份。';
    } finally {
        setCloudBackupBusy(false);
    }
};

const backupCloudNow = async () => {
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.backupNow();
        await refreshCloudBackupView(true);
    } catch (error) {
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '雲端備份失敗。';
    } finally {
        setCloudBackupBusy(false);
    }
};

const deleteAllCloudBackups = async () => {
    if (!confirm('確定刪除所有雲端備份及這部裝置的備份金鑰？\n\n本機聊天不會刪除，但之後無法從這些雲端版本復原。')) return;
    if (!confirm('這個動作不能復原。確定繼續？')) return;
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.deleteAllCloudData();
        cloudBackupList = [];
        cloudBackupHasLocalKey = false;
        renderCloudBackupState();
    } catch (error) {
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '刪除雲端備份失敗。';
    } finally {
        setCloudBackupBusy(false);
    }
};


export type CloudBackupUiHandle = {
    open: () => void;
    renderProgress: (progress: CloudBackupProgress) => void;
    refreshIfOpen: (fetchRemote?: boolean) => Promise<void>;
};

export const createCloudBackupUi = (
    manager: CloudBackupManager,
    memories: MemoryManager,
): CloudBackupUiHandle => {
    cloudBackupManager = manager;
    memoryManager = memories;
    if (!listenersAttached) {
        closeCloudBackupBtn.addEventListener('click', closeCloudBackup);
        cloudBackupModal.addEventListener('click', event => {
            if (event.target === cloudBackupModal && !cloudBackupBusy) closeCloudBackup();
        });
        enableCloudBackupBtn.addEventListener('click', () => void setupCloudBackup());
        restoreCloudWithPasswordBtn.addEventListener('click', restoreLatestCloudBackupWithPassword);
        cloudBackupNowBtn.addEventListener('click', () => void backupCloudNow());
        cloudRestoreLatestBtn.addEventListener('click', () => {
            const latest = cloudBackupList[0];
            if (latest) void restoreCloudBackupVersion(latest);
        });
        refreshCloudBackupsBtn.addEventListener('click', () => void refreshCloudBackupView(true));
        scanLocalPhotoVaultBtn.addEventListener('click', () => void scanLocalPhotoVault());
        cloudBackupAutoToggle.addEventListener('change', () => {
            cloudBackupManager.setEnabled(cloudBackupAutoToggle.checked);
            renderCloudBackupState();
        });
        deleteCloudBackupsBtn.addEventListener('click', () => void deleteAllCloudBackups());
        cloudBackupPasswordConfirm.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void setupCloudBackup();
            }
        });
        cloudRestorePassword.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                restoreLatestCloudBackupWithPassword();
            }
        });
        listenersAttached = true;
    }
    return {
        open: openCloudBackup,
        renderProgress: renderCloudBackupProgress,
        refreshIfOpen: async (fetchRemote = false) => {
            if (!cloudBackupModal.classList.contains('hidden')) {
                await refreshCloudBackupView(fetchRemote);
            }
        },
    };
};