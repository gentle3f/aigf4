import { requireAuthenticatedRequest } from './_auth.js';

const WIKIPEDIA_TIMEOUT_MS = 15_000;
const SEARCH_RESULT_LIMIT = 5;
const CLIENT_AGENT = 'aigf4/1.0 (https://aigf4.vercel.app; public identity resolver)';

const fetchWikipedia = async (language, params) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WIKIPEDIA_TIMEOUT_MS);
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  Object.entries({ action: 'query', format: 'json', formatversion: '2', ...params })
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': CLIENT_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const pageUrl = (language, title) => (
  `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
);

const normalizeCandidate = (language, page) => ({
  id: `${language}:${page.pageid}`,
  language,
  title: String(page.title || ''),
  description: String(page.terms?.description?.[0] || ''),
  extract: String(page.extract || '').replace(/\s+/g, ' ').trim(),
  pageUrl: pageUrl(language, String(page.title || '')),
  thumbnailUrl: page.thumbnail?.source || undefined,
  originalImageUrl: page.original?.source || undefined,
});

const searchLanguage = async (language, query) => {
  const data = await fetchWikipedia(language, {
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: SEARCH_RESULT_LIMIT,
    prop: 'pageimages|pageterms|extracts',
    piprop: 'thumbnail|original',
    pithumbsize: '640',
    wbptterms: 'description',
    exintro: '1',
    explaintext: '1',
    exsentences: '4',
    redirects: '1',
  });
  return (data.query?.pages || [])
    .sort((left, right) => (left.index || 99) - (right.index || 99))
    .map(page => normalizeCandidate(language, page))
    .filter(candidate => candidate.title && (candidate.description || candidate.extract));
};

const searchCandidates = async (query) => {
  const containsHan = /\p{Script=Han}/u.test(query);
  const primaryLanguage = containsHan ? 'zh' : 'en';
  const secondaryLanguage = primaryLanguage === 'zh' ? 'en' : 'zh';
  const primary = await searchLanguage(primaryLanguage, query);
  if (primary.length >= 3) return primary.slice(0, SEARCH_RESULT_LIMIT);

  const secondary = await searchLanguage(secondaryLanguage, query);
  const seen = new Set(primary.map(item => item.title.toLowerCase()));
  return [
    ...primary,
    ...secondary.filter(item => !seen.has(item.title.toLowerCase())),
  ].slice(0, SEARCH_RESULT_LIMIT);
};

const ignoredMediaPattern = /(?:logo|icon|symbol|map|flag|commons|wikidata|question|vote|edit-clear|semi-protect|speaker|audio|portal|crystal|nuvola)/i;

const rankMediaTitle = (fileTitle, entityTitle) => {
  const normalizedFile = fileTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const tokens = entityTitle.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1);
  return tokens.reduce((score, token, index) => (
    score + (normalizedFile.includes(token) ? Math.max(2, 8 - index) : 0)
  ), 0);
};

const loadPageMedia = async (language, title) => {
  const imageList = await fetchWikipedia(language, {
    prop: 'images',
    titles: title,
    imlimit: '40',
  });
  const imageTitles = (imageList.query?.pages?.[0]?.images || [])
    .map(item => String(item.title || ''))
    .filter(fileTitle => /\.(?:png|jpe?g|webp)$/i.test(fileTitle) && !ignoredMediaPattern.test(fileTitle))
    .sort((left, right) => rankMediaTitle(right, title) - rankMediaTitle(left, title))
    .slice(0, 12);
  if (imageTitles.length === 0) return [];

  const imageInfo = await fetchWikipedia(language, {
    prop: 'imageinfo',
    titles: imageTitles.join('|'),
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '640',
  });

  return (imageInfo.query?.pages || [])
    .map(page => {
      const info = page.imageinfo?.[0];
      if (!info?.url || !String(info.mime || '').startsWith('image/')) return null;
      return {
        title: String(page.title || ''),
        thumbnailUrl: info.thumburl || info.url,
        originalUrl: info.url,
        sourceUrl: info.descriptionurl || pageUrl(language, String(page.title || '')),
        license: String(info.extmetadata?.LicenseShortName?.value || '來源頁面標示'),
        score: rankMediaTitle(String(page.title || ''), title),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map(({ score, ...media }) => media);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuthenticatedRequest(req, res)) return;

  try {
    const query = String(req.query?.q || '').trim().slice(0, 160);
    const title = String(req.query?.title || '').trim().slice(0, 180);
    const language = req.query?.lang === 'zh' ? 'zh' : 'en';
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (query) {
      return res.status(200).json({ results: await searchCandidates(query) });
    }
    if (title) {
      return res.status(200).json({ media: await loadPageMedia(language, title) });
    }
    return res.status(400).json({ error: 'Missing q or title.' });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'Wikipedia lookup timed out.'
        : error instanceof Error ? error.message : 'Wikipedia lookup failed.',
    });
  }
}
