// Word Error Rate (word-level Levenshtein distance / reference word count).
// Standard ASR scoring metric: substitutions + insertions + deletions, all
// weighted equally, normalized by the reference length.

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ') // strip punctuation, keep letters/digits/apostrophes
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordErrorRate(reference, hypothesis) {
  const ref = normalize(reference).split(' ').filter(Boolean)
  const hyp = normalize(hypothesis).split(' ').filter(Boolean)
  if (ref.length === 0) return { distance: hyp.length, refWords: 0, wer: hyp.length > 0 ? 1 : 0 }

  // Classic DP edit distance over words.
  const dp = Array.from({ length: ref.length + 1 }, () => new Array(hyp.length + 1).fill(0))
  for (let i = 0; i <= ref.length; i++) dp[i][0] = i
  for (let j = 0; j <= hyp.length; j++) dp[0][j] = j
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  const distance = dp[ref.length][hyp.length]
  return { distance, refWords: ref.length, wer: distance / ref.length }
}
