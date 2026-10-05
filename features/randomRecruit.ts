import type { RandomAdultFemalePersona } from '../randomPersona.js';
import type {
    VeniceImageModelSummary,
    VeniceImageRequest,
} from '../veniceImage.js';
import {
    VENICE_IMAGE_GENERATE_MODEL,
} from '../veniceImagePolicy.js';
import { VENICE_AUTH_REQUIRED_ERROR } from '../venice.js';
import { optimizeAvatarDataUrl } from './avatarImage.js';

export type RandomRecruitDependencies = {
    createPersona: () => Promise<RandomAdultFemalePersona>;
    persistPersona: (persona: RandomAdultFemalePersona) => string;
    loadImageModels: () => Promise<void>;
    getImageModels: () => VeniceImageModelSummary[];
    requestImage: (request: VeniceImageRequest) => ReturnType<
        typeof import('../veniceImage.js')['requestVeniceImage']
    >;
    saveAvatar: (personaKey: string, avatarUrl: string) => Promise<void>;
    refreshPersonaList: () => void;
    openPersonaChat: (personaKey: string) => void;
    handleAuthRequired: () => void;
};

export type RandomRecruitHandle = {
    run: () => Promise<void>;
};

const randomRecruitBtn = document.getElementById('random-recruit-btn') as HTMLButtonElement;
const randomRecruitStatus = document.getElementById('random-recruit-status')!;

let dependencies: RandomRecruitDependencies | null = null;
let isRandomRecruiting = false;

const getDependencies = () => {
    if (!dependencies) throw new Error('Random recruit dependencies are not initialized.');
    return dependencies;
};

const runRandomRecruit = async () => {
    if (isRandomRecruiting) return;

    isRandomRecruiting = true;
    randomRecruitBtn.disabled = true;
    randomRecruitBtn.textContent = '正在建立角色...';
    randomRecruitStatus.textContent = '正在抽選香港成年女性身分、職業、關係與鮮明人格...';
    randomRecruitStatus.classList.remove('hidden', 'text-red-300', 'text-emerald-300');
    randomRecruitStatus.classList.add('text-teal-200');

    let personaKey: string | null = null;
    try {
        const persona = await getDependencies().createPersona();
        personaKey = getDependencies().persistPersona(persona);
        getDependencies().refreshPersonaList();

        randomRecruitBtn.textContent = '正在生成專屬頭像...';
        randomRecruitStatus.textContent = `已建立 ${persona.name}（${persona.occupation}），正在由 Venice 生成香港風格專屬頭像...`;

        await getDependencies().loadImageModels();
        const imageModels = getDependencies().getImageModels();
        const model = imageModels.find(item => item.id === VENICE_IMAGE_GENERATE_MODEL)
            || imageModels.find(item => item.traits.includes('most_uncensored'))
            || imageModels[0];
        if (!model) throw new Error('目前沒有可用的 Venice 圖片模型。');

        const supportedRatios = model.constraints.aspectRatios || [];
        const aspectRatio = supportedRatios.includes('1:1')
            ? '1:1'
            : supportedRatios[0];
        const supportedResolutions = model.constraints.resolutions || [];
        const resolution = supportedResolutions.includes('1K')
            ? '1K'
            : supportedResolutions[0];

        const result = await getDependencies().requestImage({
            mode: 'generate',
            model: model.id,
            prompt: persona.avatarPrompt,
            negativePrompt: 'minor, child, teenager, schoolgirl, male, multiple people, duplicate face, text, watermark, blurry, low quality, deformed hands',
            aspectRatio,
            resolution,
            width: supportedRatios.length === 0 ? 1024 : undefined,
            height: supportedRatios.length === 0 ? 1024 : undefined,
            variants: 1,
            steps: model.constraints.steps?.default,
            adultConfirmed: true,
        });
        if (!result.blobs[0]) throw new Error('Venice 沒有傳回頭像。');

        const avatarUrl = await optimizeAvatarDataUrl(result.blobs[0]);
        await getDependencies().saveAvatar(personaKey, avatarUrl);
        getDependencies().refreshPersonaList();
        randomRecruitStatus.textContent = `${persona.name} 已建立完成，專屬頭像也已儲存。`;
        randomRecruitStatus.classList.remove('text-teal-200');
        randomRecruitStatus.classList.add('text-emerald-300');
        getDependencies().openPersonaChat(personaKey);
    } catch (error) {
        const message = error instanceof Error ? error.message : '隨機角色建立失敗。';
        if (message === VENICE_AUTH_REQUIRED_ERROR) getDependencies().handleAuthRequired();

        randomRecruitStatus.textContent = personaKey
            ? `角色已建立，但頭像生成失敗：${message}`
            : `建立失敗：${message}`;
        randomRecruitStatus.classList.remove('text-teal-200');
        randomRecruitStatus.classList.add('text-red-300');
        if (personaKey) {
            getDependencies().refreshPersonaList();
            alert(`角色已保留，但隨機頭像生成失敗。你仍可在角色卡或聊天選單自行更換頭像。\n\n${message}`);
            getDependencies().openPersonaChat(personaKey);
        }
    } finally {
        isRandomRecruiting = false;
        randomRecruitBtn.disabled = false;
        randomRecruitBtn.textContent = '隨機生成角色';
    }
};

export const createRandomRecruit = (deps: RandomRecruitDependencies): RandomRecruitHandle => {
    dependencies = deps;
    return { run: runRandomRecruit };
};
