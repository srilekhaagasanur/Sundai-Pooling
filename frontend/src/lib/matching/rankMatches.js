import { defaultMatchScorer } from "./scorers";

/**
 * Filter + sort candidates with a pluggable scorer.
 * Scorer signature: (myRide, otherRide) => { score, label, meta } | null
 */
export function rankMatches(myRide, candidates, scorer = defaultMatchScorer) {
  const ranked = [];

  for (const candidate of candidates) {
    const result = scorer(myRide, candidate);
    if (!result) {
      continue;
    }
    ranked.push({
      ...candidate,
      matchScore: result.score,
      matchLabel: result.label,
      matchMeta: result.meta,
    });
  }

  ranked.sort((a, b) => {
    if (a.matchScore !== b.matchScore) {
      return a.matchScore - b.matchScore;
    }
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

  return ranked;
}
