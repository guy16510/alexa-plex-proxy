const LEADING_ARTICLES = /^(the|a|an)\s+/i;

function canonicalizeSpellings(value) {
  return value
    .replace(/\bneighbour/g, 'neighbor')
    .replace(/\bcolour/g, 'color')
    .replace(/\bfavourite/g, 'favorite')
    .replace(/\bcentre/g, 'center')
    .replace(/\btheatre/g, 'theater')
    .replace(/\bgrey\b/g, 'gray');
}

export function normalizeText(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return canonicalizeSpellings(normalized);
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

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitution
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function editSimilarity(left, right) {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - (levenshtein(left, right) / longest);
}

function phoneticToken(value) {
  const token = value
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^wh/, 'w')
    .replace(/ph/g, 'f')
    .replace(/ough/g, 'o')
    .replace(/igh/g, 'i')
    .replace(/tch/g, 'ch')
    .replace(/dg/g, 'j')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/[zv]/g, (match) => (match === 'z' ? 's' : 'f'))
    .replace(/(.)\1+/g, '$1');
  if (!token) return '';
  return token[0] + token.slice(1).replace(/[aeiouyhw]/g, '');
}

function phoneticPhrase(value) {
  return value
    .split(' ')
    .filter(Boolean)
    .map(phoneticToken)
    .join(' ');
}

function phoneticSimilarity(left, right) {
  const leftKey = phoneticPhrase(left);
  const rightKey = phoneticPhrase(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 1;
  return editSimilarity(leftKey, rightKey);
}

export function matchScore(query, candidate) {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;

  if (normalizedQuery === normalizedCandidate) return 1;

  const queryWithoutArticle = withoutLeadingArticle(normalizedQuery);
  const candidateWithoutArticle = withoutLeadingArticle(normalizedCandidate);
  if (queryWithoutArticle === candidateWithoutArticle) return 0.99;

  let score = 0;
  if (normalizedCandidate.startsWith(normalizedQuery)) score = Math.max(score, 0.92);
  if (normalizedQuery.startsWith(normalizedCandidate)) score = Math.max(score, 0.88);
  if (normalizedCandidate.includes(normalizedQuery)) score = Math.max(score, 0.84);
  if (normalizedQuery.includes(normalizedCandidate)) score = Math.max(score, 0.8);

  score = Math.max(score, jaccard(queryWithoutArticle, candidateWithoutArticle) * 0.94);
  score = Math.max(score, dice(queryWithoutArticle, candidateWithoutArticle) * 0.86);
  score = Math.max(score, editSimilarity(queryWithoutArticle, candidateWithoutArticle) * 0.93);

  const phonetic = phoneticSimilarity(queryWithoutArticle, candidateWithoutArticle);
  const shortestLength = Math.min(queryWithoutArticle.length, candidateWithoutArticle.length);
  if (shortestLength >= 4) score = Math.max(score, phonetic * 0.9);

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
