const CODE_LIKE_LINE = /(?:\b(?:const|let|var|function|class|return|import|export)\b|=>|;\s*$|\\[nrtbfv0]|(?:[A-Za-z]:\\|\\\\)[^\s]+)/u;
const ARTIFICIAL_QUOTE_ESCAPE = /\\(["'`\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f])/gu;

/**
 * Review models occasionally return JSON-style escaped quotation marks inside
 * prose. Limit repair to quote escapes in non-code lines so paths and snippets
 * retain their literal backslashes.
 */
export const normalizeArtificialProseEscapes = (value: string): string => value
    .split(/(```[\s\S]*?```)/gu)
    .map(part => {
        if (part.startsWith('```')) return part;
        return part.split('\n').map(line => (
            CODE_LIKE_LINE.test(line) ? line : line.replace(ARTIFICIAL_QUOTE_ESCAPE, '$1')
        )).join('\n');
    })
    .join('');
