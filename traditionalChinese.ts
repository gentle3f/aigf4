import { Converter } from 'opencc-js/cn2t';

// Use the full phrase-aware dictionary instead of a partial character map.
const toTraditional = Converter({ from: 'cn', to: 'hk' });
export const normalizeHongKongTraditional = (text: string): string => toTraditional(text);
