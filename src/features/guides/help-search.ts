import { FEATURE_GUIDES, FeatureGuide } from './guide-registry';

const STOP_WORDS = new Set('a an the how do does did i me my we you your is are was what where when can could would should to this that it of for in on please help mean means'.split(' '));
function tokens(text: string) {
  return [...new Set(text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word)))];
}

// Small, bounded Damerau-Levenshtein distance: handles mistkaes as well as missing letters.
function near(a: string, b: string) {
  const limit = a.length >= 8 && b.length >= 8 ? 2 : 1;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > limit) return false;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length] <= limit;
}

const index = FEATURE_GUIDES.map((feature: FeatureGuide) => ({
  feature,
  terms: [
    ...tokens(feature.name).map(word => ({ word, weight: 5 })),
    ...tokens(feature.searchTerms.join(' ')).map(word => ({ word, weight: 4 })),
    ...tokens(feature.description).map(word => ({ word, weight: 1 })),
  ],
  phrases: feature.searchTerms.map(term => tokens(term).join(' ')),
}));

/** Offline retrieval only. Queries never execute actions, access study data or leave the device. */
export function searchGuides(query: string): FeatureGuide[] {
  const words = tokens(query.slice(0, 200)).filter(word => word.length <= 32).slice(0, 12);
  if (!words.length) return [];
  const phrase = words.join(' ');
  return index.map(entry => {
    let matched = 0;
    let score = 0;
    for (const word of words) {
      let best = 0;
      for (const term of entry.terms) {
        const quality = word === term.word ? 1 : word.length >= 3 && term.word.startsWith(word) ? 0.7 : near(word, term.word) ? 0.5 : 0;
        best = Math.max(best, quality * term.weight);
      }
      if (best) matched++;
      score += best;
    }
    const exactPhrase = entry.phrases.includes(phrase);
    return { feature: entry.feature, score: score + (exactPhrase ? 12 : 0), coverage: matched / words.length };
  }).filter(result => result.score > 0 && result.coverage >= 0.6)
    .sort((a, b) => b.coverage - a.coverage || b.score - a.score || a.feature.id.localeCompare(b.feature.id))
    .slice(0, 5).map(result => result.feature);
}

export const HELP_EXAMPLES = FEATURE_GUIDES.filter((guide): guide is typeof guide & { exampleQuery: string } => 'exampleQuery' in guide);
