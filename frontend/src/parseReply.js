const EMOTIONS = ['happy', 'sad', 'neutral'];

// Pure: turn a raw model reply into {text, emotion}. Never throws.
// Kept in its own import-light module so it's unit-testable without
// dragging in the WebGPU engine libs (which crash under jsdom).
export function parseRustyReply(raw) {
  const cleaned = String(raw).replace(/```json\s*|\s*```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.text === 'string') {
      const emotion = EMOTIONS.includes(obj.emotion) ? obj.emotion : 'neutral';
      return { text: obj.text, emotion };
    }
  } catch (_) { /* fall through */ }
  return { text: cleaned || 'huh? say that again 🐼', emotion: 'neutral' };
}
