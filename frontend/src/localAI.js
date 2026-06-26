const EMOTIONS = ['happy', 'sad', 'neutral'];

export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// Pure: turn a raw model reply into {text, emotion}. Never throws.
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
