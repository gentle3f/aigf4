import { setPersistedAppSetting } from '../appSettings.js';
import {
    createRandomAdultFemalePersona,
    type RandomAdultFemalePersona,
} from '../randomPersona.js';

const RANDOM_PERSONA_VARIATION_HISTORY_KEY = 'aigf4RandomPersonaVariationsV2';

export type ExistingPersonaSummary = {
    name: string;
    description?: string;
    prompt?: string;
    memory?: string;
};

const readVariationHistory = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(RANDOM_PERSONA_VARIATION_HISTORY_KEY) || '[]') as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === 'string').slice(-80)
            : [];
    } catch {
        return [];
    }
};

export const createFreshRandomPersona = (
    existingPersonas: ExistingPersonaSummary[],
): RandomAdultFemalePersona => {
    const variationHistory = readVariationHistory();
    const persona = createRandomAdultFemalePersona({
        existingNames: existingPersonas.map(item => item.name),
        existingPersonaText: existingPersonas.map(item => (
            [item.name, item.description, item.prompt, item.memory || ''].filter(Boolean).join('\n')
        )),
        avoidVariationKeys: variationHistory,
    });
    setPersistedAppSetting(
        RANDOM_PERSONA_VARIATION_HISTORY_KEY,
        JSON.stringify([...variationHistory, persona.variationKey].slice(-80)),
    );
    return persona;
};
