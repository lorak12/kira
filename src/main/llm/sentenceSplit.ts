// Splits a reply into sentence-ish chunks for streamed TTS (see speak() in
// index.ts): each chunk is synthesized and sent to the renderer as soon as
// it's ready, so playback of sentence 1 starts while sentence 2 is still
// being synthesized, instead of the user hearing dead air for however long
// the *whole* reply takes to synthesize. Deliberately simple regex, not a
// real sentence tokenizer (so "Dr. Smith" splits wrong) -- Kira's replies
// are short and conversational, so an occasional over-split just means an
// extra beat of a pause, not a broken sentence.
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=\S)/

// Below this length, splitting costs more (an extra TTS API round-trip per
// chunk) than it saves (there's barely any "later sentences" to overlap
// synthesis with) -- most of Kira's replies are one short sentence and
// should go out as a single normal TTS call, unchanged from before this.
const MIN_LENGTH_TO_CHUNK = 60

/**
 * Splits `text` into playback chunks. Returns a single-element array
 * (`[text]`) for short or single-sentence replies -- streaming only kicks
 * in when there's a real second sentence for it to help with.
 */
export function splitForStreaming(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return ['']
  if (trimmed.length < MIN_LENGTH_TO_CHUNK) return [trimmed]

  const parts = trimmed
    .split(SENTENCE_BOUNDARY)
    .map((p) => p.trim())
    .filter(Boolean)

  return parts.length > 1 ? parts : [trimmed]
}
