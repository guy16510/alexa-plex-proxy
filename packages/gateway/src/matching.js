const STOP_WORDS = new Set(['a', 'an', 'the', 'of']);

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshteinDistance(left, right) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);

  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    previous = current;
  }

  return previous[b.length];
}

export function scoreMatch(query, candidate) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);

  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 0.94;
  if (normalizedCandidate.includes(normalizedQuery)) return 0.89;
  if (normalizedQuery.includes(normalizedCandidate)) return 0.84;

  const queryTokens = new Set(normalizedQuery.split(' ').filter((token) => !STOP_WORDS.has(token)));
  const candidateTokens = new Set(normalizedCandidate.split(' ').filter((token) => !STOP_WORDS.has(token)));
  const sharedTokens = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const tokenScore = sharedTokens / Math.max(queryTokens.size, candidateTokens.size);

  const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
  const editScore = 1 - distance / Math.max(normalizedQuery.length, normalizedCandidate.length);

  return Math.max(0, Math.min(0.83, tokenScore * 0.55 + editScore * 0.45));
}

export function bestMatch(query, candidates, titleSelector = (item) => item.title) {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreMatch(query, titleSelector(candidate))
    }))
    .sort((left, right) => right.score - left.score)[0] ?? null;
}
