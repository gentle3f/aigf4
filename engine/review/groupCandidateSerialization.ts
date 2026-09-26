import type { GroupGenerationResult } from '../../groupChat.js';

/**
 * Preserves the strict-review transport envelope for group candidates.
 * Kept separate so calibration fixtures exercise the exact production shape.
 */
export const serializeGroupGenerationForReview = (result: GroupGenerationResult): string => {
    const chat = result.segments.map(segment => segment.type === 'narration'
        ? `（${segment.text}）`
        : `${segment.speakerName || segment.speakerId}：「${segment.text}」`).join('\n');
    const scene = JSON.stringify({
        location: result.scene.location,
        reality_layer: result.scene.realityLayer,
        present_member_ids: result.scene.presentMemberIds,
        summary: result.scene.summary,
        unresolved: result.scene.unresolved,
        wardrobe_updates: {
            user: result.scene.wardrobe?.user || 'KEEP',
            members: Object.entries(result.scene.wardrobe?.characters || {}).map(([member_id, outfit]) => ({
                member_id,
                outfit,
            })),
        },
    });
    return [
        `<chat>${chat}</chat>`,
        `<scene>${scene}</scene>`,
        `<npc_candidate>${JSON.stringify(result.npcCandidate || null)}</npc_candidate>`,
    ].join('');
};
