// managers.ts
import { personas as initialPersonas } from "./personas.tsx";

// --- Constants ---
export const DIARY_CHECKPOINT = '[DIARY_CHECKPOINT]';
export const POLICY_VIOLATION = '[POLICY_VIOLATION]';

// --- Type Definitions ---
export interface Interest {
  id: string;
  name: string;
  description: string;
  locked_description: string;
  icon: string;
  unlock_keywords: string[];
  unlock_threshold: number;
  prompt_injection: string;
  progress: number;
  unlocked: boolean;
}

/**
 * Cleans raw text output from the AI by removing thought processes and other immersion-breaking artifacts.
 * @param rawText The raw string from the AI.
 * @param personaName Optional persona name to remove conversational prefixes.
 * @returns A cleaned string ready for display.
 */
export function cleanAiResponse(rawText: string | null | undefined, personaName?: string): string {
    if (!rawText) {
        return '';
    }
    
    let processedText = rawText;

    // The new core instruction encourages using parentheses for narration.
    // This line is now commented out to allow narrative text to be displayed.
    // processedText = processedText.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');

    // Filter out entire lines that consist of thought processes or meta-commentary.
    let cleanedText = processedText
        .split('\n')
        .filter(line => {
            const trimmedLine = line.trim();
            const lowerLine = trimmedLine.toLowerCase();

            // Filter for "思緒:" (thought process)
            if (lowerLine.startsWith('思緒：') || lowerLine.startsWith('thought:')) {
                return false;
            }
            
            // NEW: Filter out instruction blocks from the model's output.
            if (lowerLine.startsWith('special instruction:')) {
                return false;
            }

            // Filter specific meta-commentary patterns based on user feedback.
            // Catches: "我會將這些細節融入回應中..."
            if (trimmedLine.startsWith('我會將') && trimmedLine.includes('融入回應')) {
                return false;
            }

            // Catches: "...以符合燄喜的設定。"
            if (trimmedLine.includes('以符合') && trimmedLine.includes('的設定')) {
                return false;
            }
            
            // Catches: "這是一個純文字回應，不是拍照，所以不需JSON。"
            if (trimmedLine.includes('純文字回應') || (trimmedLine.includes('不是拍照') && trimmedLine.includes('不需JSON'))) {
                return false;
            }
            
            // Catches things like "表達我的主動、誘惑和對親密的渴望"
            if (trimmedLine.startsWith('表達我的')) {
                return false;
            }
            
            // If after removing parentheses, the line is empty, filter it out.
            if (trimmedLine === '') {
                return false;
            }

            return true;
        })
        .join('\n')
        .trim();
    
    // Remove novel-style persona name prefixes, if a name is provided
    if (personaName) {
        const namePrefixRegex = new RegExp(`^\\s*${personaName}\\s*[:：]\\s*`);
        cleanedText = cleanedText.replace(namePrefixRegex, '').trim();
    }

    // Replace phrases that break immersion
    const memoryErrorPatterns = [
        /you generated a photo/gi, /the photo you generated/gi,
        /I generated for you/gi, /photo I generated/gi,
        /the generated photo/gi,
    ];
    for (const pattern of memoryErrorPatterns) {
        cleanedText = cleanedText.replace(pattern, "那張照片");
    }

    return cleanedText;
}



export interface Content {
    text?: string;
    imageUrl?: string;
}

export interface ChatMessage {
    role: 'user' | 'model' | 'system';
    content: Content;
}

export interface DiaryEntry {
    title: string;
    content: string;
}

export interface Persona {
    name: string;
    emoji: string;
    gender: "male" | "female";
    description: string;
    prompt: string;
    greeting: string;
    avatarPrompt: string;
    avatarUrl: string | null;
    memory?: string;
}

export interface AllData {
    chatHistories?: { [key: string]: ChatMessage[] };
    customPersonas?: { [key: string]: Persona };
    diaries?: { [key: string]: DiaryEntry[] };
    interests?: { [key: string]: Interest[] };
}

// --- Memory Manager ---
/**
 * Manages all application state including personas and chat histories.
 * Handles persistence to localStorage.
 */
export class MemoryManager {
    private personas: { [key: string]: Persona };
    private chatHistories: { [key: string]: ChatMessage[] } = {};
    private diaries: { [key: string]: DiaryEntry[] } = {};
    private interests: { [personaKey: string]: Interest[] } = {};
    private customPersonaCounter: number = 0;

    constructor() {
        this.personas = { ...initialPersonas };
        this.loadModifiedPersonas();
    }
    
    getModifiedAndCustomPersonas(): { [key: string]: Persona } {
        const personasToSave: { [key: string]: Persona } = {};
        for (const key in this.personas) {
            // It's a custom persona, save it.
            if (key.startsWith('custom_')) {
                personasToSave[key] = this.personas[key];
                continue;
            }

            // It's a built-in persona, check if it's different from the original.
            const originalPersona = initialPersonas[key];
            if (originalPersona) {
                const currentPersona = this.personas[key];
                // Check for modifications. God mode changes 'prompt'. Users can change avatarPrompt, avatarUrl, and memory.
                if (currentPersona.prompt !== originalPersona.prompt || 
                    currentPersona.avatarPrompt !== originalPersona.avatarPrompt ||
                    currentPersona.avatarUrl !== originalPersona.avatarUrl ||
                    currentPersona.memory !== originalPersona.memory
                ) 
                {
                    personasToSave[key] = currentPersona;
                }
            }
        }
        return personasToSave;
    }

    // --- Persistence Methods ---

    private loadModifiedPersonas() {
        try {
            const saved = localStorage.getItem('customPersonas');
            if (saved) {
                const modifiedPersonas = JSON.parse(saved);
                Object.assign(this.personas, modifiedPersonas);

                const customKeys = Object.keys(modifiedPersonas).filter(key => key.startsWith('custom_'));
                if (customKeys.length > 0) {
                    const maxCounter = Math.max(...customKeys.map(key => {
                        const match = key.match(/custom_(\d+)_/);
                        return match ? parseInt(match[1]) : 0;
                    }));
                    this.customPersonaCounter = maxCounter;
                }
            }
        } catch (error) {
            console.error('Failed to load custom personas:', error);
        }
    }

    private persistModifiedPersonas() {
        try {
            localStorage.setItem('customPersonas', JSON.stringify(this.getModifiedAndCustomPersonas()));
        } catch (error) {
            console.error('Failed to save custom personas:', error);
        }
    }
    
    loadAllData(data: AllData) {
        if (data.customPersonas) {
            Object.assign(this.personas, data.customPersonas);
            this.persistModifiedPersonas();
        }
        if (data.chatHistories) {
            Object.assign(this.chatHistories, data.chatHistories);
        }
        if (data.diaries) {
            this.diaries = data.diaries;
        }
        if (data.interests) {
            this.interests = data.interests;
        }
    }

    // --- Persona Methods ---

    getCustomPersonas(): { [key: string]: Persona } {
        const customs: { [key: string]: Persona } = {};
        for (const [key, persona] of Object.entries(this.personas)) {
            if (key.startsWith('custom_')) {
                customs[key] = persona;
            }
        }
        return customs;
    }

    getAllPersonas(): { [key: string]: Persona } {
        return this.personas;
    }

    getPersona(key: string): Persona | undefined {
        return this.personas[key];
    }

    saveCustomPersona(personaData: any): string {
        this.customPersonaCounter++;
        const personaKey = `custom_${this.customPersonaCounter}_${Date.now()}`;

        this.personas[personaKey] = {
            name: personaData.name,
            emoji: personaData.emoji,
            description: personaData.description,
            prompt: personaData.prompt,
            greeting: personaData.greeting,
            avatarPrompt: personaData.avatarPrompt,
            gender: personaData.gender,
            avatarUrl: null,
            memory: ""
        };
        this.persistModifiedPersonas();
        return personaKey;
    }

    updatePersona(key: string, data: Partial<Persona>) {
        if (this.personas[key]) {
            Object.assign(this.personas[key], data);
            this.persistModifiedPersonas();
        }
    }
    
    updatePersonaWithCustomData(key: string, personaData: any) {
        if (key.startsWith('custom_')) {
            this.personas[key] = personaData;
            this.persistModifiedPersonas();
        }
    }

    deleteCustomPersona(key: string): boolean {
        if (key.startsWith('custom_') && this.personas[key]) {
            delete this.personas[key];
            delete this.chatHistories[key];
            delete this.diaries[key];
            delete this.interests[key];
            this.persistModifiedPersonas();
            return true;
        }
        return false;
    }

    // --- Chat History Methods ---

    getChatHistory(key: string): ChatMessage[] {
        if (!this.chatHistories[key] || this.chatHistories[key].length === 0) {
            const persona = this.getPersona(key);
            this.chatHistories[key] = persona
                ? [{ role: 'model', content: { text: persona.greeting } }]
                : [];
        }
        return this.chatHistories[key];
    }
    
    setChatHistory(key: string, history: ChatMessage[]) {
        this.chatHistories[key] = history;
    }

    getAllChatHistories(): { [key: string]: ChatMessage[] } {
        return this.chatHistories;
    }

    addMessage(key: string, role: 'user' | 'model' | 'system', content: Content) {
        if (!this.chatHistories[key]) {
            this.getChatHistory(key); // Initialize if it doesn't exist
        }
        this.chatHistories[key].push({ role, content });
    }

    pruneLastUserMessage(key: string) {
        if (!this.chatHistories[key]) return;

        const history = this.chatHistories[key];
        let lastUserIndex = -1;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }

        if (lastUserIndex !== -1) {
            this.chatHistories[key].splice(lastUserIndex, 1);
        }
    }

    clearChatHistory(key: string) {
        const persona = this.getPersona(key);
        if (persona) {
            this.chatHistories[key] = [{ role: 'model', content: { text: persona.greeting } }];
            delete this.diaries[key];
            delete this.interests[key];
        }
    }
    
    // --- Diary Methods ---

    getDiaryEntries(key: string): DiaryEntry[] {
        return this.diaries[key] || [];
    }

    addDiaryEntry(key: string, entry: DiaryEntry) {
        if (!this.diaries[key]) {
            this.diaries[key] = [];
        }
        this.diaries[key].push(entry);
    }
    
    getAllDiaryEntries(): { [key: string]: DiaryEntry[] } {
        return this.diaries;
    }

    // --- Interest Methods ---

    getAllInterests(): { [key: string]: Interest[] } {
        return this.interests;
    }

    getInterests(personaKey: string): Interest[] {
        return this.interests[personaKey] || [];
    }

    getActiveInterest(personaKey: string): Interest | null {
        const personaInterests = this.getInterests(personaKey);
        if (personaInterests.length === 0) {
            return null;
        }
        const lastInterest = personaInterests[personaInterests.length - 1];
        return lastInterest.unlocked ? null : lastInterest;
    }

    addInterest(personaKey: string, interest: Interest) {
        if (!this.interests[personaKey]) {
            this.interests[personaKey] = [];
        }
        this.interests[personaKey].push(interest);
    }

    updateInterestProgress(personaKey: string, interestId: string, points: number = 1): number {
        const interests = this.getInterests(personaKey);
        const interest = interests.find(i => i.id === interestId);
        if (interest && !interest.unlocked) {
            interest.progress += points;
            return interest.progress;
        }
        return -1; // Indicate not found or already unlocked
    }

    unlockInterest(personaKey: string, interestId: string): Interest | null {
        const interests = this.getInterests(personaKey);
        const interest = interests.find(i => i.id === interestId);
        if (interest) {
            interest.unlocked = true;
            return interest;
        }
        return null;
    }


    // --- Key Memory Methods (Re-implemented to read from chat history) ---

    getKeyMemories(key: string): string[] {
        if (!this.chatHistories[key]) {
            return [];
        }
        return this.chatHistories[key]
            .filter(msg => msg.role === 'system' && msg.content.text?.startsWith('[約會回憶]'))
            .map(msg => msg.content.text!.replace('[約會回憶] ', ''));
    }

    // --- Dating Cooldown Methods ---

    recordDateCompletion(key: string) {
        // This function is kept for compatibility with the dating module,
        // but the cooldown logic has been removed per user request.
    }

    canProposeDate(key: string): boolean {
        // Cooldown removed per user request. AI can always propose a date.
        return true;
    }
}
