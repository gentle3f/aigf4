// managers.ts
import { personas as initialPersonas, ccV3Persona } from "./personas.tsx";

// --- Constants ---
export const DIARY_CHECKPOINT = '[DIARY_CHECKPOINT]';
export const POLICY_VIOLATION = '[POLICY_VIOLATION]';
const CHAT_HISTORY_STORAGE_KEY = 'chatHistories';
const SEEDED_CUSTOM_PERSONAS_VERSION = 'cc_seed_v4';
const SEEDED_CUSTOM_PERSONAS_VERSION_KEY = 'seededCustomPersonasVersion';
const BUILT_IN_CC_KEY = 'cc';
const LEGACY_CC_SEED_KEY = 'custom_seed_cc';
const BUILT_IN_CC_VERSION = 'cc_v3_1';
const BUILT_IN_CC_VERSION_KEY = 'builtInCcPersonaVersion';
const PERSONA_SUPPLEMENT_MARKER = '\n\n人格補充：';
const SCENE_END_MARKER = '[SCENE END]';
const LEGACY_CC_DESCRIPTION = '港式語感、嘴硬會收、私下其實很暖的曖昧系女生';
const LEGACY_CC_GREETING = '喂，你做咩突然咁靜呀？(我攤喺床上望住螢幕，指尖敲咗兩下手機殼) 我啱啱諗起你，想搵你講兩句。你而家有冇空？';
const LEGACY_CC_MEMORY_PREFIX = '香港女生語感；以自然港式口語、短句、反問';

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



export type CharacterPhotoProposalStatus = 'pending' | 'generating' | 'generated' | 'declined' | 'failed';

export interface CharacterPhotoProposal {
    id: string;
    prompt: string;
    scenePrompt?: string;
    caption: string;
    aspectRatio: '1:1' | '3:4' | '4:5' | '16:9' | '9:16';
    status: CharacterPhotoProposalStatus;
    createdAt: number;
    useAvatarReference: boolean;
    identityMode?: 'avatar_reference' | 'persona_description' | 'public_identity';
    modelId?: string;
    modelName?: string;
    resolution?: string;
    estimatedPriceUsd?: number;
    error?: string;
    senderMemberId?: string;
    subjectMemberIds?: string[];
}

export interface ChatSegment {
    type: 'narration' | 'dialogue';
    text: string;
    speakerId?: string;
    speakerName?: string;
}

export interface ChatAttachment {
    id: string;
    assetId: string;
    name: string;
    mimeType: string;
    size: number;
    kind: 'image' | 'document' | 'video' | 'other';
    width?: number;
    height?: number;
}

export interface MemoryProposal {
    id: string;
    targetMemberIds: string[];
    originalText: string;
    summary: string;
    status: 'pending' | 'saved' | 'session-only' | 'declined';
    createdAt: number;
}

export interface PhotoIntentProposal {
    id: string;
    senderMemberId?: string;
    subjectMemberIds: string[];
    requestText: string;
    status: 'pending' | 'confirmed' | 'declined';
    createdAt: number;
}

export interface NpcPromotionProposal {
    id: string;
    name: string;
    gender: 'male' | 'female';
    description: string;
    publicFigureQuery?: string;
    status: 'pending' | 'added' | 'dismissed';
    memberId?: string;
    createdAt: number;
}

export interface ImageGenerationMetadata {
    mode: 'generate' | 'edit';
    modelId?: string;
    modelName?: string;
    aspectRatio?: string;
    resolution?: string;
    useAvatarReference?: boolean;
    identityMode?: 'avatar_reference' | 'persona_description' | 'public_identity';
}

export interface Content {
    text?: string;
    segments?: ChatSegment[];
    attachments?: ChatAttachment[];
    imageUrl?: string;
    imageAssetId?: string;
    imagePrompt?: string;
    imageGeneration?: ImageGenerationMetadata;
    photoProposal?: CharacterPhotoProposal;
    memoryProposal?: MemoryProposal;
    photoIntent?: PhotoIntentProposal;
    npcProposal?: NpcPromotionProposal;
    legacy?: boolean;
}

export interface ChatMessage {
    id?: string;
    createdAt?: number;
    speakerId?: string;
    role: 'user' | 'model' | 'system';
    content: Content;
}

export interface DiaryEntry {
    title: string;
    content: string;
}

export type PublicIdentityKind = 'real_person' | 'fictional_character' | 'other';

export interface PublicIdentity {
    canonicalName: string;
    kind: PublicIdentityKind;
    summary: string;
    visualPrompt: string;
    stylePrompt?: string;
    sourceTitle: string;
    sourceUrl: string;
    sourceLanguage: 'en' | 'zh';
    referenceImageUrl?: string;
    referenceImageSourceUrl?: string;
    verifiedAt: number;
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
    publicIdentityEnabled?: boolean;
    publicIdentity?: PublicIdentity;
}

export interface AllData {
    chatHistories?: { [key: string]: ChatMessage[] };
    customPersonas?: { [key: string]: Persona };
    diaries?: { [key: string]: DiaryEntry[] };
    interests?: { [key: string]: Interest[] };
}

const SEEDED_CUSTOM_PERSONAS: { [key: string]: Persona } = {
    [LEGACY_CC_SEED_KEY]: { ...ccV3Persona },
};

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
        this.loadChatHistories();
        this.promoteLegacyCcSeed();
        this.upgradeBundledCcPersona();
        this.ensureSeededCustomPersonas();
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
                    currentPersona.description !== originalPersona.description ||
                    currentPersona.greeting !== originalPersona.greeting ||
                    currentPersona.avatarPrompt !== originalPersona.avatarPrompt ||
                    currentPersona.avatarUrl !== originalPersona.avatarUrl ||
                    currentPersona.memory !== originalPersona.memory ||
                    Boolean(currentPersona.publicIdentityEnabled) !== Boolean(originalPersona.publicIdentityEnabled) ||
                    JSON.stringify(currentPersona.publicIdentity || null) !== JSON.stringify(originalPersona.publicIdentity || null)
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

    private promoteLegacyCcSeed() {
        const legacyPersona = this.personas[LEGACY_CC_SEED_KEY];
        if (!legacyPersona || !this.personas[BUILT_IN_CC_KEY]) {
            return;
        }

        const legacyHistory = this.chatHistories[LEGACY_CC_SEED_KEY] || [];
        const currentHistory = this.chatHistories[BUILT_IN_CC_KEY] || [];
        if (legacyHistory.length > 0) {
            this.chatHistories[BUILT_IN_CC_KEY] = currentHistory.length > 0
                ? [...legacyHistory, ...currentHistory]
                : [...legacyHistory];
            delete this.chatHistories[LEGACY_CC_SEED_KEY];
        }

        if (this.diaries[LEGACY_CC_SEED_KEY]?.length && !this.diaries[BUILT_IN_CC_KEY]?.length) {
            this.diaries[BUILT_IN_CC_KEY] = this.diaries[LEGACY_CC_SEED_KEY];
        }
        delete this.diaries[LEGACY_CC_SEED_KEY];

        if (this.interests[LEGACY_CC_SEED_KEY]?.length && !this.interests[BUILT_IN_CC_KEY]?.length) {
            this.interests[BUILT_IN_CC_KEY] = this.interests[LEGACY_CC_SEED_KEY];
        }
        delete this.interests[LEGACY_CC_SEED_KEY];

        delete this.personas[LEGACY_CC_SEED_KEY];
        this.persistModifiedPersonas();
        this.persistChatHistories();
    }

    private upgradeBundledCcPersona(force = false) {
        try {
            const current = this.personas[BUILT_IN_CC_KEY];
            if (!current) {
                return;
            }

            const storedVersion = localStorage.getItem(BUILT_IN_CC_VERSION_KEY);
            const hasLegacyBundledPrompt =
                current.prompt.includes('Voice fidelity rules:') &&
                current.prompt.includes('The goal is not to copy a transcript mechanically.');
            if (!force && storedVersion === BUILT_IN_CC_VERSION && !hasLegacyBundledPrompt) {
                return;
            }

            if (hasLegacyBundledPrompt) {
                const markerIndex = current.prompt.indexOf(PERSONA_SUPPLEMENT_MARKER);
                const supplement = markerIndex === -1
                    ? ''
                    : current.prompt.slice(markerIndex + PERSONA_SUPPLEMENT_MARKER.length).trim();

                this.personas[BUILT_IN_CC_KEY] = {
                    ...current,
                    description: current.description === LEGACY_CC_DESCRIPTION
                        ? ccV3Persona.description
                        : current.description,
                    prompt: supplement
                        ? `${ccV3Persona.prompt}${PERSONA_SUPPLEMENT_MARKER}${supplement}`
                        : ccV3Persona.prompt,
                    greeting: current.greeting === LEGACY_CC_GREETING
                        ? ccV3Persona.greeting
                        : current.greeting,
                    memory: current.memory?.startsWith(LEGACY_CC_MEMORY_PREFIX)
                        ? ccV3Persona.memory
                        : current.memory,
                };
                this.persistModifiedPersonas();
            }

            const ccHistory = this.chatHistories[BUILT_IN_CC_KEY];
            const shouldStartFreshScene =
                (storedVersion !== BUILT_IN_CC_VERSION || hasLegacyBundledPrompt) &&
                ccHistory?.some(message => message.role === 'user') &&
                ccHistory.at(-1)?.content.text?.trim() !== SCENE_END_MARKER;
            if (shouldStartFreshScene) {
                ccHistory.push({ role: 'system', content: { text: SCENE_END_MARKER } });
                this.persistChatHistories();
            }

            localStorage.setItem(BUILT_IN_CC_VERSION_KEY, BUILT_IN_CC_VERSION);
        } catch (error) {
            console.error('Failed to upgrade bundled Cc persona:', error);
        }
    }

    private ensureSeededCustomPersonas() {
        try {
            const seededVersion = localStorage.getItem(SEEDED_CUSTOM_PERSONAS_VERSION_KEY);
            if (seededVersion === SEEDED_CUSTOM_PERSONAS_VERSION) {
                return;
            }

            const existingNames = new Set(
                Object.values(this.personas).map(persona => String(persona?.name || '').trim().toLowerCase()),
            );

            let addedAny = false;
            for (const [key, persona] of Object.entries(SEEDED_CUSTOM_PERSONAS)) {
                if (this.personas[key]) {
                    // Refresh bundled seeded personas on version bumps while preserving uploaded avatar changes.
                    this.personas[key] = {
                        ...persona,
                        avatarUrl: this.personas[key].avatarUrl ?? persona.avatarUrl,
                    };
                    addedAny = true;
                    continue;
                }

                if (existingNames.has(persona.name.trim().toLowerCase())) {
                    continue;
                }

                this.personas[key] = { ...persona };
                addedAny = true;
            }

            if (addedAny) {
                this.persistModifiedPersonas();
            }

            localStorage.setItem(SEEDED_CUSTOM_PERSONAS_VERSION_KEY, SEEDED_CUSTOM_PERSONAS_VERSION);
        } catch (error) {
            console.error('Failed to seed custom personas:', error);
        }
    }

    private persistModifiedPersonas(throwOnError = false) {
        try {
            localStorage.setItem('customPersonas', JSON.stringify(this.getModifiedAndCustomPersonas()));
        } catch (error) {
            console.error('Failed to save custom personas:', error);
            if (throwOnError) throw error;
        }
    }

    private loadChatHistories() {
        try {
            const saved = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
            if (!saved) return;

            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                this.chatHistories = parsed;
            }
        } catch (error) {
            console.error('Failed to load chat histories:', error);
        }
    }

    private persistChatHistories(throwOnError = false) {
        try {
            localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(this.chatHistories));
        } catch (error) {
            console.error('Failed to save chat histories:', error);
            if (throwOnError) throw error;
        }
    }
    
    loadAllData(data: AllData) {
        const snapshot = {
            personas: JSON.parse(JSON.stringify(this.personas)) as { [key: string]: Persona },
            chatHistories: JSON.parse(JSON.stringify(this.chatHistories)) as { [key: string]: ChatMessage[] },
            diaries: JSON.parse(JSON.stringify(this.diaries)) as { [key: string]: DiaryEntry[] },
            interests: JSON.parse(JSON.stringify(this.interests)) as { [key: string]: Interest[] },
        };
        try {
            if (data.customPersonas) {
                Object.assign(this.personas, data.customPersonas);
            }
            if (data.chatHistories) {
                Object.assign(this.chatHistories, data.chatHistories);
            }
            if (data.diaries) {
                Object.assign(this.diaries, data.diaries);
            }
            if (data.interests) {
                Object.assign(this.interests, data.interests);
            }
            this.promoteLegacyCcSeed();
            this.upgradeBundledCcPersona(true);
            this.persistModifiedPersonas(true);
            this.persistChatHistories(true);
        } catch (error) {
            this.personas = snapshot.personas;
            this.chatHistories = snapshot.chatHistories;
            this.diaries = snapshot.diaries;
            this.interests = snapshot.interests;
            this.persistModifiedPersonas();
            this.persistChatHistories();
            throw new Error('瀏覽器儲存空間不足或資料無法完整寫入；本次匯入已取消，原有資料保持不變。');
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
            gender: "female",
            avatarUrl: null,
            memory: "",
            publicIdentityEnabled: Boolean(personaData.publicIdentityEnabled),
            publicIdentity: personaData.publicIdentity,
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
            this.persistChatHistories();
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
            this.persistChatHistories();
        }
        return this.chatHistories[key];
    }
    
    setChatHistory(key: string, history: ChatMessage[]) {
        this.chatHistories[key] = history;
        this.persistChatHistories();
    }

    hasChatHistory(key: string) {
        return Array.isArray(this.chatHistories[key]) && this.chatHistories[key].length > 0;
    }

    peekChatHistory(key: string): ChatMessage[] {
        return this.chatHistories[key] || [];
    }

    getAllChatHistories(): { [key: string]: ChatMessage[] } {
        return this.chatHistories;
    }

    addMessage(
        key: string,
        role: 'user' | 'model' | 'system',
        content: Content,
        metadata: Pick<ChatMessage, 'speakerId' | 'createdAt' | 'id'> = {},
    ) {
        if (!this.chatHistories[key]) {
            this.getChatHistory(key); // Initialize if it doesn't exist
        }
        this.chatHistories[key].push({
            id: metadata.id || crypto.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            createdAt: metadata.createdAt || Date.now(),
            speakerId: metadata.speakerId,
            role,
            content,
        });
        this.persistChatHistories();
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
            this.persistChatHistories();
        }
    }

    clearChatHistory(key: string) {
        const persona = this.getPersona(key);
        if (persona) {
            this.chatHistories[key] = [{ role: 'model', content: { text: persona.greeting } }];
        } else {
            this.chatHistories[key] = [];
        }
        delete this.diaries[key];
        delete this.interests[key];
        this.persistChatHistories();
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
