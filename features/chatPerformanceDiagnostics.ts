import {
    clearChatPerformanceTurns,
    getChatPerformanceSnapshot,
    isChatPerformanceEnabled,
    setChatPerformanceEnabled,
    type ChatPerformanceTurn,
} from '../chatPerformance.js';
import {
    summarizeChatPerformanceTurn,
    type ChatPerformanceSummary,
} from '../chatPerformanceSummary.js';
import { experienceDialog } from './chatExperienceUi.js';

const moreOptionsMenu = document.getElementById('more-options-menu')!;

const average = (values: Array<number | undefined>) => {
    const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!finite.length) return undefined;
    return Math.round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
};

const formatMs = (value: number | undefined) => value === undefined ? '—' : `${value} ms`;

const turnKind = (turn: ChatPerformanceTurn) => (
    turn.events.some(event => (
        event.label === 'generation:group-parse'
        || event.label === 'response:group-scene-persist'
    ))
        ? 'Group'
        : 'Single / other'
);

const createExport = () => {
    const snapshot = getChatPerformanceSnapshot();
    const serialize = (turn: ChatPerformanceTurn) => ({
        kind: turnKind(turn),
        summary: summarizeChatPerformanceTurn(turn),
        events: turn.events,
    });

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        enabled: snapshot.enabled,
        privacy: 'Timing/event labels only. No prompt, user message, or assistant reply text.',
        active: snapshot.active ? serialize(snapshot.active) : null,
        completed: snapshot.completed.map(serialize),
    };
};

const downloadOrShare = async (status: HTMLParagraphElement) => {
    const json = JSON.stringify(createExport(), null, 2);
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const filename = `aigf-performance-${stamp}.json`;
    const file = new File([json], filename, { type: 'application/json' });

    try {
        if (
            typeof navigator.share === 'function'
            && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [file] })
        ) {
            await navigator.share({
                files: [file],
                title: 'AIGF Performance Diagnostics',
            });
            status.textContent = '已開啟分享功能。';
            return;
        }
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            status.textContent = '已取消分享。';
            return;
        }
    }

    const url = URL.createObjectURL(file);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        status.textContent = '已下載 Performance JSON。';
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};

export const openChatPerformanceDiagnostics = () => {
    const dialog = experienceDialog('Performance 診斷');
    dialog.classList.add('jev-shadow-dialog');
    moreOptionsMenu.classList.add('hidden');

    const subtitle = document.createElement('p');
    subtitle.className = 'jev-shadow-subtitle';
    subtitle.textContent = '只記錄 timing 與 event labels；不記錄 prompt、你的訊息或角色回覆文字。最多保留本頁 24 個已完成回合，重新載入頁面後清空。';

    const controls = document.createElement('div');
    controls.className = 'jev-shadow-controls';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = '重新整理';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '複製 JSON';
    const shareOrDownload = document.createElement('button');
    shareOrDownload.type = 'button';
    shareOrDownload.textContent = '分享 / 下載 JSON';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '清除記錄';
    controls.append(toggle, refresh, copy, shareOrDownload, clear);

    const status = document.createElement('p');
    status.className = 'jev-shadow-action-status';
    const content = document.createElement('div');
    content.className = 'jev-shadow-content';

    const render = () => {
        const snapshot = getChatPerformanceSnapshot();
        toggle.textContent = snapshot.enabled ? '停止記錄' : '開始記錄';
        content.replaceChildren();

        const summaries = snapshot.completed.map(turn => summarizeChatPerformanceTurn(turn));
        const generatedSummaries = summaries.filter(item => typeof item.requestStartElapsedMs === 'number');
        const stats = document.createElement('div');
        stats.className = 'jev-shadow-summary';
        const addStat = (label: string, value: string) => {
            const card = document.createElement('div');
            card.className = 'jev-shadow-stat';
            const title = document.createElement('small');
            title.textContent = label;
            const number = document.createElement('strong');
            number.textContent = value;
            card.append(title, number);
            stats.append(card);
        };

        addStat('Recording', snapshot.enabled ? 'ON' : 'OFF');
        addStat('Completed / generated', `${snapshot.completed.length} / ${generatedSummaries.length}`);
        addStat('Avg total', formatMs(average(generatedSummaries.map(item => item.totalMs))));
        addStat('Avg network', formatMs(average(generatedSummaries.map(item => item.networkObservedMs))));
        addStat('Avg local before request', formatMs(average(generatedSummaries.map(item => item.localBeforeRequestMs))));
        addStat('Avg post-network render', formatMs(average(generatedSummaries.map(item => item.postNetworkToRenderMs))));
        content.append(stats);

        if (!snapshot.completed.length) {
            const empty = document.createElement('p');
            empty.className = 'jev-shadow-empty';
            empty.textContent = snapshot.enabled
                ? '記錄已開啟。正常使用聊天幾個回合後，再回來重新整理。'
                : '目前未有 timing 記錄。按「開始記錄」後正常聊天即可。';
            content.append(empty);
            return;
        }

        const tableWrap = document.createElement('div');
        tableWrap.className = 'jev-shadow-table-wrap';
        const table = document.createElement('table');
        table.className = 'jev-shadow-table';
        const head = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Mode', 'Total', 'Network', 'Local pre', 'Post-network', 'Review', 'Retry'].forEach(label => {
            const cell = document.createElement('th');
            cell.textContent = label;
            headerRow.append(cell);
        });
        head.append(headerRow);
        const body = document.createElement('tbody');

        snapshot.completed.forEach((turn, index) => {
            const summary: ChatPerformanceSummary = summaries[index];
            const row = document.createElement('tr');
            [
                turnKind(turn),
                formatMs(summary.totalMs),
                formatMs(summary.networkObservedMs),
                formatMs(summary.localBeforeRequestMs),
                formatMs(summary.postNetworkToRenderMs),
                formatMs(summary.strictReviewRequestMs),
                `${summary.repairRequests} / ${summary.fallbackRequests}`,
            ].forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
            });
            body.append(row);
        });

        table.append(head, body);
        tableWrap.append(table);
        content.append(tableWrap);
    };

    toggle.onclick = () => {
        const wasEnabled = isChatPerformanceEnabled();
        const enabled = setChatPerformanceEnabled(!wasEnabled);
        status.textContent = wasEnabled && enabled
            ? '網址的 ?perf 仍然強制開啟記錄；移除 ?perf 後才可停止。'
            : enabled
                ? '已開始記錄；之後的聊天回合會保留 timing。'
                : '已停止記錄。';
        render();
    };

    refresh.onclick = () => {
        status.textContent = '';
        render();
    };

    copy.onclick = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(createExport()));
            status.textContent = '已複製 Performance JSON。';
        } catch {
            status.textContent = '未能複製 JSON；請改用「分享 / 下載 JSON」。';
        }
    };

    shareOrDownload.onclick = () => {
        void downloadOrShare(status);
    };

    clear.onclick = () => {
        if (!confirm('清除本頁所有 Performance timing 記錄？這不會影響聊天或設定。')) return;
        clearChatPerformanceTurns();
        status.textContent = '已清除 Performance timing 記錄。';
        render();
    };

    dialog.append(subtitle, controls, status, content);
    render();
};
