import type { SurpriseEventCategory, SurpriseEventProposal } from './managers.js';

export const getSurpriseEventCategoryLabel = (category: SurpriseEventCategory) => ({
    idol_schedule: '偶像行程',
    backstage: '後台突發',
    public_spotlight: '聚光燈下',
    secret_escape: '秘密出走',
    unexpected_guest: '意外來客',
    celebration: '特別日子',
    travel: '旅程插曲',
    domestic: '日常變奏',
    emotional_turn: '情感轉折',
    rivalry: '微妙競爭',
    mystery: '神秘邀請',
    fantasy: '幻想事件',
})[category];

export const getSurpriseEventIntensityLabel = (intensity: SurpriseEventProposal['intensity']) => ({
    gentle: '溫柔',
    playful: '玩味',
    dramatic: '戲劇',
    heated: '升溫',
})[intensity];
