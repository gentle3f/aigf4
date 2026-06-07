// aiTools.tsx
import { Type } from "@google/genai";

// Tool for generating a photo of the persona
const generatePhotoTool = {
    name: "generate_photo",
    description: "When the user asks for a photo, or asks the persona to smile, wink, etc., call this function to generate an image. This simulates the persona taking a picture.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            response_text: {
                type: Type.STRING,
                description: "The text response to say to the user right before taking the photo. E.g., 'Sure, here you go! Cheese!'"
            },
            photo_prompt: {
                type: Type.STRING,
                description: "A short, SFW English description of the facial expression or simple action for the photo. E.g., 'a gentle smile', 'blushing shyly', 'a playful wink'."
            }
        },
        required: ["response_text", "photo_prompt"]
    }
};

// Tool for proposing a date
const proposeDateTool = {
    name: "propose_date",
    description: "When the conversation provides a good opportunity (e.g., talking about hobbies, movies, feeling bored), call this function to proactively ask the user on a date.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            response_text: {
                type: Type.STRING,
                description: "The text used to propose the date. E.g., 'That sounds fun! It makes me want to ask you out to the movies. Would you like to go?'"
            },
            location: {
                type: Type.STRING,
                description: "The suggested location for the date, which should be relevant to the conversation. E.g., 'movie theater', 'park', 'cafe'."
            },
            duration: {
                type: Type.INTEGER,
                description: "The proposed duration of the date in hours. Must be a random integer between 1 and 4."
            }
        },
        required: ["response_text", "location", "duration"]
    }
};

// Tool for writing a diary entry
const writeDiaryEntryTool = {
    name: "write_diary_entry",
    description: "When a memorable moment occurs in the conversation, call this function to decide to write a new diary entry about it.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            response_text: {
                type: Type.STRING,
                description: "The text to say to the user to announce that you're writing in the diary. E.g., 'This moment is so special, I have to write it in our diary!'"
            }
        },
        required: ["response_text"]
    }
};

// Tool for discovering a new interest
const discoverNewInterestTool = {
    name: "discover_new_interest",
    description: "When the conversation inspires you to develop a new hobby or interest, call this function. This should happen organically when a new topic excites you.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            response_text: {
                type: Type.STRING,
                description: "A short, subtle phrase to hint that you've found a new interest. E.g., 'You know, talking about this makes me realize I'm really interested in...'"
            },
            name: { type: Type.STRING, description: "The brief name of the new interest (e.g., 'Stargazing')." },
            icon: { type: Type.STRING, description: "A single emoji that represents the interest." },
            description: { type: Type.STRING, description: "A one-sentence description of what this interest means to you once unlocked." },
            locked_description: { type: Type.STRING, description: "A mysterious one-sentence description for before it's unlocked." },
            unlock_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of 5-8 keywords the user might say to make progress." },
            unlock_threshold: { type: Type.INTEGER, description: "The number of times keywords must be mentioned to unlock (between 3 and 5)." },
            prompt_injection: { type: Type.STRING, description: "A very short (max 15 words) reminder for yourself that you have this interest." }
        },
        required: ["response_text", "name", "icon", "description", "locked_description", "unlock_keywords", "unlock_threshold", "prompt_injection"]
    }
};

// Tool for making progress on an existing interest
const progressInterestTool = {
    name: "progress_interest",
    description: "If the user's message contains keywords related to one of your existing, locked interests, call this function to acknowledge it and make progress.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            response_text: {
                type: Type.STRING,
                description: "The text response acknowledging the user's comment and relating it to your budding interest. E.g., 'Oh, you mentioned the stars! I've been looking at them a lot lately...'"
            },
            interest_id: {
                type: Type.STRING,
                description: "The ID of the interest you are making progress on."
            }
        },
        required: ["response_text", "interest_id"]
    }
};


export const functionDeclarations = [
    generatePhotoTool,
    proposeDateTool,
    writeDiaryEntryTool,
    discoverNewInterestTool,
    progressInterestTool,
];
