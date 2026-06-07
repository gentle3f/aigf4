// diary.ts
import { GoogleGenAI, Type } from "@google/genai";
import { MemoryManager, Persona, DIARY_CHECKPOINT, POLICY_VIOLATION, ChatMessage } from "./managers.js";

// --- DOM Elements ---
const manualGenerateDiaryBtn = document.getElementById('manual-generate-diary-btn')!;
const diaryModal = document.getElementById('diary-modal')!;
const closeDiaryModal = document.getElementById('close-diary-modal')!;
const diaryLoading = document.getElementById('diary-loading')!;
const diaryLoadingText = document.getElementById('diary-loading-text')!;
const diaryText = document.getElementById('diary-text')!;
const diaryStatusText = document.getElementById('diary-status-text') as HTMLParagraphElement;
const generateDiaryBtn = document.getElementById('generate-diary-btn') as HTMLButtonElement;
const downloadDiaryBtn = document.getElementById('download-diary-btn') as HTMLButtonElement;
const diaryEntrySelect = document.getElementById('diary-entry-select') as HTMLSelectElement;
const diaryTurnIntervalInput = document.getElementById('diary-turn-interval-input') as HTMLInputElement;
const moreOptionsMenu = document.getElementById('more-options-menu')!;

// --- State ---
let ai: GoogleGenAI;
let memoryManager: MemoryManager;
let getCurrentPersona: () => Persona | null;
let getCurrentPersonaKey: () => string | null;

const showDiaryModal = () => {
    updateDiaryModalState();
    diaryModal.classList.remove('hidden');
};
const hideDiaryModal = () => diaryModal.classList.add('hidden');


function downloadDiary() {
    const persona = getCurrentPersona();
    const personaKey = getCurrentPersonaKey();
    if (!persona || !personaKey) return;
    
    const allEntries = memoryManager.getDiaryEntries(personaKey);
    
    if (allEntries.length === 0) {
        alert('沒有可下載的日記內容。');
        return;
    }

    const fullDiary = allEntries.map(entry => `--- ${entry.title} ---\n\n${entry.content}`).join('\n\n\n');

    const blob = new Blob([fullDiary], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${persona.name}_戀愛日記.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function displaySelectedEntry() {
    const personaKey = getCurrentPersonaKey();
    if (!personaKey) return;

    const entries = memoryManager.getDiaryEntries(personaKey);
    const selectedValue = diaryEntrySelect.value;
    
    const selectedIndex = parseInt(selectedValue, 10);
    if (!isNaN(selectedIndex) && entries[selectedIndex]) {
        diaryText.textContent = entries[selectedIndex].content;
    } else {
         const turns = countTurnsSinceLastCheckpoint(personaKey);
        const minTurnsRequired = parseInt(diaryTurnIntervalInput.value, 10) || 5;
        const canGenerate = turns >= minTurnsRequired;

        if (entries.length === 0) {
             if (canGenerate) {
                diaryText.textContent = '你們的日記即將展開，點擊「寫新日記」開始吧！';
            } else {
                diaryText.textContent = '回憶還不夠喔，再多聊幾句，創造共同回憶來寫成日記吧！';
            }
        } else {
            diaryText.textContent = '從上方選擇一篇日記來閱讀吧。';
        }
    }
}


function updateDiaryModalState() {
    const personaKey = getCurrentPersonaKey();
    if (!personaKey) return;

    const entries = memoryManager.getDiaryEntries(personaKey);
    const turns = countTurnsSinceLastCheckpoint(personaKey);
    const minTurnsRequired = parseInt(diaryTurnIntervalInput.value, 10) || 5;
    const canGenerate = turns >= minTurnsRequired;

    diaryStatusText.textContent = `手動建立需求: ${turns} / ${minTurnsRequired} 輪對話`;
    generateDiaryBtn.disabled = !canGenerate;
    downloadDiaryBtn.disabled = entries.length === 0;

    const currentSelection = diaryEntrySelect.value;
    diaryEntrySelect.innerHTML = '';

    if (entries.length === 0) {
        const option = document.createElement('option');
        option.textContent = '還沒有日記';
        option.disabled = true;
        diaryEntrySelect.appendChild(option);
    } else {
        entries.forEach((entry, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = entry.title;
            diaryEntrySelect.appendChild(option);
        });
    }

    const optionExists = Array.from(diaryEntrySelect.options).some(opt => opt.value === currentSelection);
    if (optionExists) {
        diaryEntrySelect.value = currentSelection;
    } else if (entries.length > 0) {
        diaryEntrySelect.value = (entries.length - 1).toString();
    }
    
    displaySelectedEntry();
}


function countTurnsSinceLastCheckpoint(personaKey: string): number {
    const chatHistory = memoryManager.getChatHistory(personaKey);
    let lastCheckpointIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'system' && chatHistory[i].content.text === DIARY_CHECKPOINT) {
            lastCheckpointIndex = i;
            break;
        }
    }

    const historySlice = chatHistory.slice(lastCheckpointIndex + 1);

    return historySlice.reduce((count, msg) => {
        if (msg.role === 'user') {
            return count + 1;
        }
        if (msg.role === 'system' && msg.content.text?.startsWith('[約會回憶]')) {
            return count + 1;
        }
        return count;
    }, 0);
}

/**
 * Sanitizes chat history by removing policy violation markers and the user messages that caused them.
 * This prevents a past rejection from contaminating the context for a new API call.
 * @param history The original chat history slice.
 * @returns A sanitized chat history slice.
 */
function sanitizeHistoryForDiary(history: ChatMessage[]): ChatMessage[] {
    // Filter out any policy violation markers, but leave user messages intact.
    return history.filter(msg =>
        !(msg.role === 'system' && msg.content.text === POLICY_VIOLATION)
    );
}


async function generateNewDiaryEntry(personaKey: string, isManual: boolean = false): Promise<boolean> {
    const persona = memoryManager.getPersona(personaKey);
    if (!persona) return false;

    // For manual generation, check turn count. For auto, proceed regardless.
    if (isManual && countTurnsSinceLastCheckpoint(personaKey) < parseInt(diaryTurnIntervalInput.value, 10)) {
        updateDiaryModalState();
        return false;
    }
    
    if (isManual) {
        diaryLoadingText.textContent = '戀愛日記撰寫中...';
        diaryLoading.classList.remove('hidden');
        diaryText.textContent = '';
    }
    
    try {
        const chatHistory = memoryManager.getChatHistory(personaKey);
        const entries = memoryManager.getDiaryEntries(personaKey);
        
        let lastCheckpointIndex = -1;
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'system' && chatHistory[i].content.text === DIARY_CHECKPOINT) {
                lastCheckpointIndex = i;
                break;
            }
        }
        const rawHistorySlice = chatHistory.slice(lastCheckpointIndex + 1);
        
        // Sanitize the history slice to remove problematic prompts
        const newHistorySlice = sanitizeHistoryForDiary(rawHistorySlice);


        const historyForDiary = newHistorySlice.map(message => {
            if (message.role === 'system') return null;
            const role = message.role === 'model' ? persona.name : '你';
            let textContent = '';
            if (message.content.text) {
                textContent = message.content.text;
            } else if (message.content.imageUrl) {
                textContent = `[${role}傳送了一張圖片]`;
            }
            return textContent ? `${role}: ${textContent}` : null;
        }).filter(Boolean).join('\n');

        const newMemories = newHistorySlice
            .filter(msg => msg.role === 'system' && msg.content.text?.startsWith('[約會回憶]'))
            .map(msg => msg.content.text!.replace('[約會回憶] ', ''));
        const memoriesForDiary = newMemories.join('; ');

        const chapterContext = entries.length > 0 ? `這是我們的第 ${entries.length + 1} 篇日記。上一篇的標題是：「${entries[entries.length - 1].title}」。請接續我們的心情故事。` : `這是我們的第一篇日記。`;

        const prompt = `你現在要以你的身份，寫一篇戀愛日記。請根據以下提供的「關鍵回憶」和「最近的對話紀錄」，寫一篇約200-300字的日記。

${chapterContext}

日記的核心應該圍繞「關鍵回憶」中描述的事件和情感。請將這些回憶點滴，用你的口吻和心情，寫成一篇充滿情感的日記。
「最近的對話紀錄」可以幫助你回憶起我們聊天的細節和你的感受。

---
[關鍵回憶]:
${memoriesForDiary || "最近沒有特別的約會活動。"}
---
[最近的對話紀錄]:
${historyForDiary}
---

**任務:**
1.  **生成標題 (title)**：為這篇日記取一個簡短、能代表你心情的標題（例如：「心跳加速的禮物」、「雨中散步的午後時光」）。
2.  **撰寫內容 (content)**：**用你的第一人稱視角**，寫下這段時間和使用者相處的點點滴滴。描述你的心情、想法，以及那些讓你心動的瞬間。請務必完全融入你的角色設定，使用你平常的說話方式和口吻。

**輸出要求**
你必須嚴格遵循以下的 JSON 格式，直接輸出純文字的JSON物件，不要包含任何Markdown的程式碼區塊標記。
{
  "title": "（生成的日記標題）",
  "content": "（生成的日記內文）"
}`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING }
            },
            required: ["title", "content"]
        };
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: persona.prompt,
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });

        if (!response.text) throw new Error("API response was empty.");
        
        const parsed = JSON.parse(response.text.trim());

        if (parsed.title && parsed.content) {
            memoryManager.addDiaryEntry(personaKey, { title: parsed.title, content: parsed.content });
            memoryManager.addMessage(personaKey, 'system', { text: DIARY_CHECKPOINT });
        } else {
            throw new Error("Generated JSON is missing title or content.");
        }
        
        if (isManual) {
            updateDiaryModalState();
        }
        return true;

    } catch (error) {
        console.error("日記生成錯誤:", error);
        if(isManual) {
            diaryText.textContent = `日記生成失敗了... 請稍後再試一次。\n\n錯誤訊息: ${error}`;
            alert(`日記生成失敗: ${error}`);
            updateDiaryModalState();
        }
        return false;
    } finally {
        if (isManual) {
            diaryLoading.classList.add('hidden');
        }
    }
}


export function initDiaryModule(
    aiInstance: GoogleGenAI,
    memManager: MemoryManager,
    getPersona: () => Persona | null,
    getPersonaKey: () => string | null
) {
    ai = aiInstance;
    memoryManager = memManager;
    getCurrentPersona = getPersona;
    getCurrentPersonaKey = getPersonaKey;
    
    manualGenerateDiaryBtn.addEventListener('click', () => {
        showDiaryModal();
        moreOptionsMenu.classList.add('hidden');
    });
    closeDiaryModal.addEventListener('click', hideDiaryModal);
    downloadDiaryBtn.addEventListener('click', downloadDiary);
    generateDiaryBtn.addEventListener('click', () => {
        const key = getCurrentPersonaKey();
        if (key) {
            generateNewDiaryEntry(key, true);
        }
    });

    diaryModal.addEventListener('click', (e) => {
        if (e.target === diaryModal) {
            hideDiaryModal();
        }
    });
    diaryEntrySelect.addEventListener('change', displaySelectedEntry);
    
    diaryTurnIntervalInput.addEventListener('change', () => {
        updateDiaryModalState(); // Update turn count display immediately
    });
    
    return {
        generateNewDiaryEntry
    };
}