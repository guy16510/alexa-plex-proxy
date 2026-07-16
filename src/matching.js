const LEADING_ARTICLES = /^(the|a|an)\s+/i;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutLeadingArticle(value) {
  return value.replace(LEADING_ARTICLES, '').trim();
}

function tokenSet(value) {
  return new Set(value.split(' ').filter(Boolean));
}

function jaccard(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function bigrams(value) {
  const compact = value.replace(/\s+/g, ' ');
  if (compact.length < 2) return new Set([compact]);
  const result = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.add(compact.slice(index, index + 2));
  }
  return result;
}

function dice(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) {
    if (b.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

export function matchScore(query, candidate) {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;

  if (normalizedQuery === normalizedCandidate) return 1;

  const queryWithoutArticle = withoutLeadingArticle(normalizedQuery);
  const candidateWithoutArticle = withoutLeadingArticle(normalizedCandidate);
  if (queryWithoutArticle === candidateWithoutArticle) return 0.98;

  let score = 0;
  if (normalizedCandidate.startsWith(normalizedQuery)) score = Math.max(score, 0.9);
  if (normalizedQuery.startsWith(normalizedCandidate)) score = Math.max(score, 0.86);
  if (normalizedCandidate.includes(normalizedQuery)) score = Math.max(score, 0.82);
  if (normalizedQuery.includes(normalizedCandidate)) score = Math.max(score, 0.78);

  score = Math.max(score, jaccard(normalizedQuery, normalizedCandidate) * 0.92);
  score = Math.max(score, dice(normalizedQuery, normalizedCandidate) * 0.82);
  return Math.min(score, 1);
}

export function bestMatch(query, candidates, getTitle = (item) => item?.title ?? '') {
  let best = null;
  for (const candidate of candidates) {
    const score = matchScore(query, getTitle(candidate));
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }
  return best;
}
