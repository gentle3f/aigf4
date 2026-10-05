import { experienceDialog } from './chatExperienceUi.js';
import { clearJevShadowRecords, getJevShadowRecords } from '../engine/review/jevShadow.js';
import {
    createJevShadowDiagnosticsExport,
    summarizeJevShadowRecords,
} from '../engine/review/jevShadowDiagnostics.js';

const moreOptionsMenu = document.getElementById('more-options-menu')!;

const formatJevNumber = (value: number | undefined, fractionDigits = 0) => value === undefined ? '—' : value.toFixed(fractionDigits);
const formatJevCost = (value: number | undefined) => value === undefined ? '—' : value < 0.01 ? value.toFixed(6) : value.toFixed(4);

export const openJevShadowDiagnostics = () => {
    const dialog = experienceDialog('Jev Shadow');
    dialog.classList.add('jev-shadow-dialog');
    moreOptionsMenu.classList.add('hidden');

    const subtitle = document.createElement('p');
    subtitle.className = 'jev-shadow-subtitle';
    subtitle.textContent = 'V3 signals + Group gate V2 + wardrobe wording A/B shadow · safe metadata kept locally across reloads · Gemma remains authoritative';
    const controls = document.createElement('div');
    controls.className = 'jev-shadow-controls';
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
    clear.textContent = '清除本頁記錄';
    controls.append(refresh, copy, shareOrDownload, clear);
    const status = document.createElement('p');
    status.className = 'jev-shadow-action-status';
    const content = document.createElement('div');
    content.className = 'jev-shadow-content';

    const render = () => {
        const records = getJevShadowRecords();
        const summary = summarizeJevShadowRecords(records);
        content.replaceChildren();
        const stats = document.createElement('div');
        stats.className = 'jev-shadow-summary';
        const addStat = (label: string, value: string, note?: string) => {
            const card = document.createElement('div');
            card.className = 'jev-shadow-stat';
            const title = document.createElement('small');
            title.textContent = label;
            const number = document.createElement('strong');
            number.textContent = value;
            card.append(title, number);
            if (note) {
                const detail = document.createElement('small');
                detail.textContent = note;
                card.append(detail);
            }
            stats.append(card);
        };
        addStat('Records', String(summary.totalRecords));
        addStat('OK / unavailable', `${summary.status.ok} / ${summary.status.unavailable}`);
        addStat('Gemma keep / revise', `${summary.gemma.keep} / ${summary.gemma.revise}`);
        addStat('Avg Jev latency', `${summary.performance.averageLatencyMs} ms`);
        addStat('Avg Jev input', String(summary.usage.averageInputTokens));
        addStat('Total Jev cost', `$${formatJevCost(summary.usage.totalCost)}`);
        addStat(
            'Wardrobe A/B paired',
            String(summary.wardrobeTrial.pairedCount),
            `prod ${formatJevNumber(summary.wardrobeTrial.productionAverage, 2)} → trial ${formatJevNumber(summary.wardrobeTrial.trialAverage, 2)} · Δ ${formatJevNumber(summary.wardrobeTrial.averageDelta, 2)}`,
        );
        addStat(
            'Wardrobe trial latency',
            `${summary.wardrobeTrial.averageLatencyMs} ms`,
            `trial cost $${formatJevCost(summary.wardrobeTrial.totalCost)}`,
        );
        if (summary.deterministicGroupNarration.checkedCount) {
            addStat(
                'Group deterministic checks',
                String(summary.deterministicGroupNarration.checkedCount),
                `violation ${summary.deterministicGroupNarration.violationCount} · clear ${summary.deterministicGroupNarration.clearCount}`,
            );
        }
        if (summary.groupGateTrial.observedCount || summary.groupGateTrial.status.unavailable || summary.groupGateTrial.status.aborted) {
            addStat(
                'Group gate V2 observed',
                String(summary.groupGateTrial.observedCount),
                `avg latency ${summary.groupGateTrial.averageLatencyMs} ms · cost $${formatJevCost(summary.groupGateTrial.totalCost)}`,
            );
        }
        content.append(stats);

        if (summary.deterministicGroupNarration.checkedCount) {
            const groupComparison = document.createElement('div');
            groupComparison.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Group narration deterministic cohort';
            const list = document.createElement('p');
            const group = summary.deterministicGroupNarration;
            list.textContent = [
                `checked ${group.checkedCount}`,
                `deterministic violation / clear ${group.violationCount} / ${group.clearCount}`,
                `Gemma issue + deterministic violation ${group.withGemmaIssueAndViolation}`,
                `Gemma issue but deterministic clear ${group.withGemmaIssueButClear}`,
                `no Gemma issue but deterministic violation ${group.withoutGemmaIssueButViolation}`,
                `both clear ${group.withoutGemmaIssueAndClear}`,
                `legacy V3 group signal avg violation / clear ${formatJevNumber(group.jevAverageWhenViolation, 2)} / ${formatJevNumber(group.jevAverageWhenClear, 2)}`,
            ].join(' · ');
            groupComparison.append(title, list);
            content.append(groupComparison);
        }

        if (summary.groupGateTrial.observedCount) {
            const gateComparison = document.createElement('div');
            gateComparison.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Group material-revision gate V2';
            const list = document.createElement('p');
            const gate = summary.groupGateTrial;
            const keep = gate.gemmaKeep;
            const revise = gate.gemmaSemanticRevise;
            list.textContent = [
                `observed ${gate.observedCount}`,
                `Gemma KEEP n=${keep.count}: avg ${formatJevNumber(keep.average, 2)} · range ${formatJevNumber(keep.minimum, 2)}–${formatJevNumber(keep.maximum, 2)}`,
                `Gemma semantic REVISE n=${revise.count}: avg ${formatJevNumber(revise.average, 2)} · range ${formatJevNumber(revise.minimum, 2)}–${formatJevNumber(revise.maximum, 2)}`,
                `deterministic-only narration n=${gate.deterministicOnlyNarration.count}: avg ${formatJevNumber(gate.deterministicOnlyNarration.average, 2)}`,
                `Gemma narration but parser clear n=${gate.gemmaNarrationButDeterministicClear.count}: avg ${formatJevNumber(gate.gemmaNarrationButDeterministicClear.average, 2)}`,
                `status ok/unavailable/aborted ${gate.status.ok}/${gate.status.unavailable}/${gate.status.aborted}`,
            ].join(' · ');
            gateComparison.append(title, list);
            content.append(gateComparison);
        }

        if (summary.groupGateTrial.semanticSignalCount) {
            const semantic = document.createElement('div');
            semantic.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Group gate V2 semantic signal averages';
            const list = document.createElement('p');
            list.textContent = Object.entries(summary.groupGateTrial.semanticSignalAverages)
                .filter(([, value]) => value > 0)
                .map(([signal, value]) => `${signal} ${formatJevNumber(value, 2)}`)
                .join(' · ');
            semantic.append(title, list);
            content.append(semantic);
        }

        if (summary.wardrobeTrial.pairedCount) {
            const comparison = document.createElement('div');
            comparison.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Wardrobe wording shadow';
            const list = document.createElement('p');
            const withIssue = summary.wardrobeTrial.withGemmaWardrobeIssue;
            const withoutIssue = summary.wardrobeTrial.withoutGemmaWardrobeIssue;
            list.textContent = [
                `paired ${summary.wardrobeTrial.pairedCount}`,
                `Gemma wardrobe issue n=${withIssue.count}: ${formatJevNumber(withIssue.productionAverage, 2)} → ${formatJevNumber(withIssue.trialAverage, 2)}`,
                `no Gemma wardrobe issue n=${withoutIssue.count}: ${formatJevNumber(withoutIssue.productionAverage, 2)} → ${formatJevNumber(withoutIssue.trialAverage, 2)}`,
            ].join(' · ');
            comparison.append(title, list);
            content.append(comparison);
        }

        const nonZeroGemmaIssues = Object.entries(summary.gemmaIssues).filter(([, count]) => count > 0);
        if (nonZeroGemmaIssues.length) {
            const reasons = document.createElement('div');
            reasons.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Gemma revise reasons';
            const list = document.createElement('p');
            list.textContent = nonZeroGemmaIssues.map(([code, count]) => `${code} ${count}`).join(' · ');
            reasons.append(title, list);
            content.append(reasons);
        }

        const nonZeroAnomalies = Object.entries(summary.gemmaIssueAnomalies).filter(([, count]) => count > 0);
        if (nonZeroAnomalies.length) {
            const anomalies = document.createElement('div');
            anomalies.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'Gemma inapplicable labels';
            const list = document.createElement('p');
            list.textContent = nonZeroAnomalies.map(([code, count]) => `${code} ${count}`).join(' · ');
            anomalies.append(title, list);
            content.append(anomalies);
        }

        const signalAverages = Object.entries(summary.signalAverages)
            .filter(([, value]) => value > 0)
            .map(([signal, value]) => `${signal} ${formatJevNumber(value, 2)}`);
        if (signalAverages.length) {
            const averages = document.createElement('div');
            averages.className = 'jev-shadow-reasons';
            const title = document.createElement('strong');
            title.textContent = 'V3 signal averages (Single / legacy Group)';
            const list = document.createElement('p');
            list.textContent = signalAverages.join(' · ');
            averages.append(title, list);
            content.append(averages);
        }

        if (!records.length) {
            const empty = document.createElement('p');
            empty.className = 'jev-shadow-empty';
            empty.textContent = 'No Jev shadow observations yet. Safe metadata is kept locally across reloads until you clear it.';
            content.append(empty);
            return;
        }

        const tableWrap = document.createElement('div');
        tableWrap.className = 'jev-shadow-table-wrap';
        const table = document.createElement('table');
        table.className = 'jev-shadow-table';
        const head = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Request', 'Mode', 'Status', 'Gemma', 'Latency', 'Tokens', 'Cost'].forEach(label => {
            const cell = document.createElement('th');
            cell.textContent = label;
            headerRow.append(cell);
        });
        head.append(headerRow);
        const body = document.createElement('tbody');
        records.slice().reverse().forEach(record => {
            const row = document.createElement('tr');
            const addCell = (text: string) => {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.append(cell);
            };
            addCell(record.requestId);
            addCell(`${record.mode} · Cc ${record.ccMode ? 'yes' : 'no'}`);
            addCell(record.reasonCode ? `${record.status} · ${record.reasonCode}${record.networkCode ? ` · ${record.networkCode}` : ''}` : record.status);
            addCell(`${record.gemmaDecision || '—'}${record.gemmaIssueCodes?.length ? ` · ${record.gemmaIssueCodes.join(', ')}` : ''}${record.gemmaIssueAnomalies?.length ? ` · anomaly: ${record.gemmaIssueAnomalies.join(', ')}` : ''}`);
            addCell(`${record.latencyMs} ms`);
            const primaryInputTokens = record.usageInputTokens ?? (record.mode === 'group' ? record.groupGateTrial?.usageInputTokens : undefined);
            const primaryOutputTokens = record.usageOutputTokens ?? (record.mode === 'group' ? record.groupGateTrial?.usageOutputTokens : undefined);
            const primaryCost = record.usageCost ?? (record.mode === 'group' ? record.groupGateTrial?.usageCost : undefined);
            addCell(`${formatJevNumber(primaryInputTokens)} / ${formatJevNumber(primaryOutputTokens)}`);
            addCell(`$${formatJevCost(primaryCost)}`);
            body.append(row);

            const detailRow = document.createElement('tr');
            detailRow.className = 'jev-shadow-detail-row';
            const detail = document.createElement('td');
            detail.colSpan = 7;
            const signals = record.signals;
            const trial = record.wardrobeTrial;
            const groupGate = record.groupGateTrial;
            const productionWardrobeSignal = signals?.wardrobeConflict
                ?? groupGate?.semanticSignals?.wardrobeConflict;
            const wardrobeDelta = productionWardrobeSignal !== undefined && trial?.wardrobeConflict !== undefined
                ? trial.wardrobeConflict - productionWardrobeSignal
                : undefined;
            detail.textContent = [
                `model: ${record.servedModel || groupGate?.servedModel || '—'}`,
                `taxonomy: ${record.taxonomyVersion}`,
                `cohort: ${record.calibrationCohort || 'legacy'}`,
                `group deterministic narration: ${record.deterministicGroupNarrationViolation === undefined ? '—' : record.deterministicGroupNarrationViolation ? 'violation' : 'clear'}`,
                `group gate V2: ${groupGate ? `${groupGate.status} · requires revision ${formatJevNumber(groupGate.requiresRevision, 2)} · ${groupGate.latencyMs} ms · model ${groupGate.servedModel || '—'} · $${formatJevCost(groupGate.usageCost)}` : '—'}`,
                `group gate semantic request/identity/speaker/continuity/reality/wardrobe/state/replay/persona/third-party/agency/ending/other: ${groupGate?.semanticSignals ? [
                    groupGate.semanticSignals.requestMismatch,
                    groupGate.semanticSignals.identityConflict,
                    groupGate.semanticSignals.speakerOwnershipViolation,
                    groupGate.semanticSignals.continuityViolation,
                    groupGate.semanticSignals.realityLayerViolation,
                    groupGate.semanticSignals.wardrobeConflict,
                    groupGate.semanticSignals.stateConflict,
                    groupGate.semanticSignals.replayedBeat,
                    groupGate.semanticSignals.personaVoiceViolation,
                    groupGate.semanticSignals.thirdPartySpeechViolation,
                    groupGate.semanticSignals.userAgencyViolation,
                    groupGate.semanticSignals.incompleteEnding,
                    groupGate.semanticSignals.otherDefect,
                ].map(value => formatJevNumber(value, 2)).join(' / ') : '—'}`,
                `wardrobe A/B prod/trial/delta: ${productionWardrobeSignal !== undefined && trial?.wardrobeConflict !== undefined
                    ? `${formatJevNumber(productionWardrobeSignal, 2)} / ${formatJevNumber(trial.wardrobeConflict, 2)} / ${formatJevNumber(wardrobeDelta, 2)}`
                    : '—'}`,
                `wardrobe trial: ${trial ? `${trial.profile} · ${trial.status} · ${trial.latencyMs} ms · model ${trial.servedModel || '—'} · $${formatJevCost(trial.usageCost)}` : 'pending'}`,
                `signals request/identity/speaker/continuity/reality/wardrobe/state/replay/persona/third-party/agency/ending/group/other: ${signals ? [
                    signals.requestMismatch,
                    signals.identityConflict,
                    signals.speakerOwnershipViolation,
                    signals.continuityViolation,
                    signals.realityLayerViolation,
                    signals.wardrobeConflict,
                    signals.stateConflict,
                    signals.replayedBeat,
                    signals.personaVoiceViolation,
                    signals.thirdPartySpeechViolation,
                    signals.userAgencyViolation,
                    signals.incompleteEnding,
                    signals.groupNarrationViolation,
                    signals.otherDefect,
                ].map(value => formatJevNumber(value, 2)).join(' / ') : '—'}`,
            ].join(' · ');
            detailRow.append(detail);
            body.append(detailRow);
        });
        table.append(head, body);
        tableWrap.append(table);
        content.append(tableWrap);
    };

    refresh.onclick = () => { status.textContent = ''; render(); };
    copy.onclick = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(createJevShadowDiagnosticsExport(getJevShadowRecords())));
            status.textContent = '已複製目前安全診斷 metadata。';
        } catch {
            status.textContent = '未能複製 JSON；手機大量記錄建議改用「分享 / 下載 JSON」。';
        }
    };
    shareOrDownload.onclick = async () => {
        const exportData = createJevShadowDiagnosticsExport(getJevShadowRecords());
        const json = JSON.stringify(exportData, null, 2);
        const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
        const filename = `aigf-jev-shadow-${stamp}.json`;
        const file = new File([json], filename, { type: 'application/json' });

        try {
            if (typeof navigator.share === 'function'
                && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'AIGF Jev Shadow',
                });
                status.textContent = '已開啟手機分享選單；可直接儲存或分享 JSON 檔。';
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
            status.textContent = '已下載完整 Jev Shadow JSON 檔。';
        } finally {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    };
    clear.onclick = () => {
        if (!confirm('清除這個頁面 session 的 Jev shadow 診斷記錄？此操作不會影響聊天或雲端資料。')) return;
        clearJevShadowRecords();
        status.textContent = '已清除本頁記錄。';
        render();
    };
    dialog.append(subtitle, controls, status, content);
    render();
};

