/**
 * Bounded, query-directed views for oversized private Luna save files.
 * Never claims the model received the entire document. Original JSON is kept
 * in the existing private attachment store and patch downloads use that Blob.
 */
export const MAX_INDEXABLE_JSON_CHARACTERS = 12_000_000;
export const MAX_JSON_INDEX_CONTEXT_CHARACTERS = 72_000;
const MAX_VISITED_NODES = 160_000;
const MAX_INDEX_RECORDS = 36;
const MAX_EXCERPT_CHARACTERS = 3_800;
const MAX_SHAPE_LINES = 125;
const MATCH_STOPWORDS = new Set(['json', 'luna', 'save', 'file', 'read', 'please', '修復', '修改', '問題', '存檔', '分析', '檢查', '角色', '內容', '對話', '劇情', '完整', '全部', '資料']);

type PathNode = { path: string; value: unknown; depth: number; parentPath: string };
type IndexCandidate = { path: string; score: number; value: unknown };
export type AssistantIndexedJsonView = {
    context: string;
    indexed: true;
    totalCharacters: number;
    visitedNodes: number;
    inspectionIsPartial: boolean;
    emittedPaths: string[];
    explicitPaths: string[];
};

const escapePointer = (key: string) => key.replace(/~/gu, '~0').replace(/\//gu, '~1');
export const encodeJsonPointer = (parts: string[]) => '/' + parts.map(escapePointer).join('/');
const childPath = (base: string, key: string) => base + '/' + escapePointer(key);

const parseExplicitPointer = (query: string): { path: string; start: number }[] => {
    const output: { path: string; start: number }[] = [];
    const seen = new Set<string>();
    // "@/history/12", "讀取 /messages/20", and JSON {"path":"/history/12"}.
    const pattern = /(?:@|(?:讀取|查看|檢查|inspect|read|path|路徑)\s*[:：]?\s*|["']path["']\s*:\s*["'])((?:\/(?:[^\s"'，,。;；\]\}\)<>{}]+))+)/giu;
    for (const match of query.slice(0, 8_000).matchAll(pattern)) {
        const path = match[1].replace(/[/]+$/u, '');
        if (path.length > 800 || seen.has(path) || !path.startsWith('/')) continue;
        seen.add(path);
        const tail = query.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 32);
        const offset = tail.match(/(?:offset|由|從|start)\s*[=:：]?\s*(\d{1,8})/iu);
        output.push({ path, start: offset ? Math.min(Number(offset[1]), 10_000_000) : 0 });
        if (output.length >= 6) break;
    }
    return output;
};

export const resolveJsonPointer = (root: unknown, pointer: string): unknown => {
    if (!pointer.startsWith('/') || pointer.length > 800) throw new Error('JSON 路徑必須以 / 開始。');
    let node: unknown = root;
    for (const token of pointer.slice(1).split('/')) {
        if (/~(?![01])/u.test(token)) throw new Error('JSON Pointer 含有錯誤轉義。');
        const part = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
        if (['__proto__','prototype','constructor'].includes(part)) throw new Error('不安全 JSON 路徑。');
        if (Array.isArray(node)) {
            if (!/^(0|[1-9][0-9]*)$/u.test(part)) throw new Error('陣列索引無效：' + part);
            const index = Number(part);
            if (!Number.isSafeInteger(index) || index >= node.length) throw new Error('陣列索引超出範圍：' + part);
            node = node[index];
        } else if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, part)) {
            node = (node as Record<string, unknown>)[part];
        } else {
            throw new Error('找不到指定 JSON 路徑：' + pointer);
        }
    }
    return node;
};

const tokenizeQuestion = (question: string): string[] => {
    const lower = question.slice(0, 1_200).toLocaleLowerCase();
    const tokens = new Set<string>();
    for (const match of lower.matchAll(/[a-z][a-z0-9_.-]{2,}|[\u3400-\u9fff]{2,}/gu)) {
        const part = match[0];
        if (part.length >= 2 && !MATCH_STOPWORDS.has(part)) tokens.add(part);
        if (/^[\u3400-\u9fff]+$/u.test(part) && part.length >= 3 && part.length <= 14) {
            for (let i = 0; i < part.length - 1; i++) {
                const gram = part.slice(i, i + 2);
                if (!MATCH_STOPWORDS.has(gram)) tokens.add(gram);
            }
        }
    }
    return [...tokens].sort((a, b) => b.length - a.length).slice(0, 36);
};

const compactPreview = (value: unknown, maxLength = MAX_EXCERPT_CHARACTERS): string => {
    const raw = JSON.stringify(value);
    if (raw === undefined) return String(value);
    if (raw.length <= maxLength) return raw;
    // NEVER present a cut string as complete JSON.
    return raw.slice(0, Math.floor(maxLength * .7))
        + '\n[… EXCERPT ONLY; remaining ' + (raw.length - maxLength) + ' characters omitted …]\n'
        + raw.slice(-Math.floor(maxLength * .3));
};

const shortShape = (value: unknown): string => {
    if (Array.isArray(value)) {
        const first = value[0];
        const kind = first === null ? 'null' : Array.isArray(first) ? 'array' : typeof first;
        return 'array(' + value.length + ', first=' + kind + ')';
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        return 'object(' + keys.length + ' keys: ' + keys.slice(0, 13).join(', ')
            + (keys.length > 13 ? ', …' : '') + ')';
    }
    if (typeof value === 'string') return 'string(' + value.length + ' chars)';
    return typeof value;
};

/** Construct a bounded, auditable index and query-relevant excerpts. */
export const prepareIndexedAssistantJson = (
    filename: string,
    raw: string,
    question: string,
): AssistantIndexedJsonView => {
    if (raw.length > MAX_INDEXABLE_JSON_CHARACTERS) {
        throw new Error('存檔超過本機索引處理上限 1,200 萬字元；請先減少存檔體積。');
    }
    let root: unknown;
    try { root = JSON.parse(raw); } catch { throw new Error('Luna 存檔 JSON 格式有錯，未能建立索引。'); }
    if (!root || typeof root !== 'object') throw new Error('Luna 存檔 JSON 必須係物件或陣列。');
    const tokens = tokenizeQuestion(question);
    const explicit = parseExplicitPointer(question);
    const shapeLines: string[] = [];
    const candidates: IndexCandidate[] = [];
    const fallback: IndexCandidate[] = [];
    const seenCandidates = new Set<string>();
    const stack: PathNode[] = [{ path:'', value:root, depth:0, parentPath:'' }];
    let visitedNodes = 0;
    let truncatedScan = false;
    const record = (path: string, value: unknown, score: number) => {
        if (!path || seenCandidates.has(path)) return;
        if (candidates.length < 180) {
            seenCandidates.add(path);
            candidates.push({ path, value, score });
        } else {
            let minIndex = 0;
            for (let i = 1; i < candidates.length; i++) if (candidates[i].score < candidates[minIndex].score) minIndex = i;
            if (score > candidates[minIndex].score) {
                seenCandidates.delete(candidates[minIndex].path);
                candidates[minIndex] = { path, value, score };
                seenCandidates.add(path);
            }
        }
    };
    while (stack.length) {
        if (visitedNodes >= MAX_VISITED_NODES) { truncatedScan = true; break; }
        const item = stack.pop()!;
        visitedNodes++;
        const { path, value, depth } = item;
        if (depth <= 3 && shapeLines.length < MAX_SHAPE_LINES) {
            shapeLines.push((path || '/') + ' : ' + shortShape(value));
        }
        if (Array.isArray(value)) {
            // Recent records often matter more than arbitrary earlier conversation data.
            const tail = /(?:chat|message|dialog|history|timeline|kakao|conversation|log|event|story|session)/iu.test(path);
            if (tail && value.length) {
                const picks = [0, 1, value.length - 3, value.length - 2, value.length - 1];
                for (const index of new Set(picks.filter(i => i >= 0 && i < value.length))) {
                    fallback.push({ path:childPath(path, String(index)), value:value[index], score:index >= value.length - 3 ? 3 : 1 });
                }
            }
            for (let index = value.length - 1; index >= 0; index--) {
                stack.push({ path:childPath(path, String(index)), parentPath:path, value:value[index], depth:depth + 1 });
            }
        } else if (value && typeof value === 'object') {
            const pairs = Object.entries(value);
            for (let index = pairs.length - 1; index >= 0; index--) {
                const [key, child] = pairs[index];
                stack.push({ path:childPath(path,key), parentPath:path, value:child, depth:depth + 1 });
            }
        } else {
            const text = String(value ?? '').toLocaleLowerCase();
            const haystack = (path + ' ' + text.slice(0, 100_000)).toLocaleLowerCase();
            let score = 0;
            for (const term of tokens) if (haystack.includes(term)) score += term.length >= 4 ? 4 : 1;
            if (score) {
                // Preserve the containing message/record alongside its exact path.
                const parent = item.parentPath ? resolveJsonPointer(root, item.parentPath) : value;
                record(item.parentPath || path, parent, score);
            }
        }
    }
    candidates.sort((a,b)=>b.score-a.score);
    fallback.sort((a,b)=>b.score-a.score);
    const lines: string[] = [];
    const label = filename.replace(/[\r\n<>]/gu,'_').slice(0,160);
    lines.push('=== INDEXED LUNA JSON FILE (PARTIAL INSPECTION) ===');
    lines.push('File: ' + label);
    lines.push('Full original characters: ' + raw.length + '; visited JSON nodes: ' + visitedNodes);
    lines.push('Original JSON is privately retained as an attachment for precise patches and future queries.');
    lines.push('IMPORTANT: THE MODEL HAS NOT READ THE WHOLE FILE. This request contains an index and bounded selected excerpts ONLY.');
    if (truncatedScan) lines.push('WARNING: Index node scan reached safety limit; some paths have not been scanned.');
    lines.push('Never claim unshown fields were verified. If more information is needed, request a JSON Pointer path.');
    lines.push('For example ask: 請讀取 @/messages/12 ; or query a person/name, scene, fault, or specific path.');
    lines.push('Unrelated save content remains untouched when generating wetapp-json-patch-v1 operations.');
    lines.push('\n--- JSON STRUCTURE INDEX ---');
    lines.push(shapeLines.join('\n'));
    const emittedPaths: string[] = [];
    const addSection = (path: string, value: unknown, title: string, start = 0) => {
        if (emittedPaths.includes(path)) return;
        if (lines.join('\n').length > MAX_JSON_INDEX_CONTEXT_CHARACTERS - 5_000) return;
        const fragment = compactPreview(value, Math.max(800, Math.min(MAX_EXCERPT_CHARACTERS, MAX_JSON_INDEX_CONTEXT_CHARACTERS - lines.join('\n').length - 1_000)));
        lines.push('\n--- '+title+' '+(path||'/')+' ---');
        if (start) {
            const rawFragment = JSON.stringify(value) || '';
            lines.push('Requested character offset '+start+' in this JSON subtree:');
            lines.push(rawFragment.slice(start,start+MAX_EXCERPT_CHARACTERS));
            lines.push('[PARTIAL character-range excerpt; not a full JSON subtree]');
        } else {
            lines.push(fragment);
        }
        emittedPaths.push(path);
    };
    for (const item of explicit) {
        try { addSection(item.path, resolveJsonPointer(root, item.path), 'EXPLICIT REQUESTED PATH',item.start); }
        catch (error) { lines.push('Requested path ' + item.path + ' not available: ' + (error instanceof Error ? error.message : 'unavailable')); }
    }
    lines.push('\n--- QUERY-RELEVANT RECORDS (PARTIAL) ---');
    for (const item of candidates.slice(0, MAX_INDEX_RECORDS)) addSection(item.path,item.value,'MATCHED RECORD');
    if (candidates.length === 0) lines.push('No direct keyword matches found in the scanned nodes. Ask for specific paths or names.');
    lines.push('\n--- REPRESENTATIVE RECENT RECORDS (PARTIAL) ---');
    for (const item of fallback.slice(0,12)) addSection(item.path,item.value,'HISTORY SAMPLE');
    lines.push('\n=== END INDEXED VIEW. ORIGINAL FILE NOT MODIFIED. ===');
    let context = lines.join('\n');
    if (context.length > MAX_JSON_INDEX_CONTEXT_CHARACTERS) {
        // Trim only auxiliary view; all chosen excerpts remain explicitly partial.
        context = context.slice(0, MAX_JSON_INDEX_CONTEXT_CHARACTERS - 120)
            + '\n[INDEX DISPLAY LIMIT REACHED: truncated index view, NOT the original file]\n=== END INDEXED VIEW ===';
    }
    return {
        context,
        indexed:true,
        totalCharacters:raw.length,
        visitedNodes,
        inspectionIsPartial:true,
        emittedPaths,
        explicitPaths:explicit.map(item=>item.path),
    };
};
