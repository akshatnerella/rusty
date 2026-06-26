# Rusty — Fully-Local Browser AI (Design Spec)

**Date:** 2026-06-25
**Status:** Approved design, pre-implementation

## Goal

Repurpose Rusty from an API-backed app (Gemini + ElevenLabs + Google STT via a
FastAPI backend) into a **100% in-browser, zero-API AI companion**. The viral
hook: *turn your wifi off and Rusty still hears you, thinks, and talks back.*
Personality is a chaotic, funny red panda.

Scope = **Option A**: core local voice loop + emotion-video avatar. Desktop-first.

## Non-Goals (deliberately skipped)

- **Vision** ("show him a photo") — needs a vision model; scope creep. Later.
- **Phone support** — iOS Safari WebGPU memory ceiling makes it a separate grind. Stretch goal.
- **Record/share-clip button** — that's Option B. Later.
- **WASM/CPU fallback** — too slow to be worth it; WebGPU-only.

## The Local Stack (all WebGPU, all in-browser)

| Job | Library | Model | First-load size |
|---|---|---|---|
| Speech→Text | Transformers.js (`@huggingface/transformers`) | `whisper-tiny.en` | ~75MB |
| Brain | WebLLM (`@mlc-ai/web-llm`) | `Qwen2.5-0.5B-Instruct` q4 | ~400MB |
| Text→Speech | `kokoro-js` | Kokoro-82M | ~80MB |

**Total first-load ≈ 600MB**, downloaded once and cached in the browser
(IndexedDB / Cache API). Every subsequent visit boots in seconds, fully offline.

## Architecture

The existing UX layer is **kept entirely**: Space-to-talk recording
(`MediaRecorder`), the emotion-video avatar (`RustyVideo`), the chat window,
audio playback, and the message log. Only the network call in the middle is
replaced.

**Today:** `App.sendAudioAndImage()` POSTs a webm blob to FastAPI, which does
STT → Gemini → ElevenLabs and returns `{audio, response_text, emotion, user_text}`.

**After:** the same function runs the pipeline locally:
```
audio blob → transcribe() → chat() → speak() → play
                              ↓
                        {text, emotion}  → RustyVideo (unchanged)
```

The `{text, emotion}` JSON contract is preserved, so the avatar's emotion logic
needs no changes.

### New module: `src/localAI.js`

One module exposing four functions. Single file, but four clearly-bounded units:

- `init(onProgress)` — loads all three models, reports 0–100% progress.
  Progressive: STT + TTS load first and resolve early so a scripted greeting can
  play; the LLM finishes loading behind it.
- `transcribe(blob)` — webm/opus blob → text. Decodes via Web Audio API
  (`decodeAudioData`), resamples to 16kHz mono `Float32Array`, runs Whisper.
- `chat(text)` — text → `{text, emotion}`. Runs Qwen with the Rusty system
  prompt; parses JSON; **falls back to `{text: <raw>, emotion: 'neutral'}` on any
  parse failure** (0.5B models fumble strict JSON).
- `speak(text)` — text → audio buffer (Kokoro), returned for playback.

### New component: `src/LoadingScreen.js`

- "Waking up Rusty…" with a progress bar driven by `init`'s `onProgress`.
- WebGPU gate: if `navigator.gpu` is absent, show "Rusty needs a WebGPU browser
  (Chrome or Edge on desktop)" instead of attempting to load.

### Changes to existing files

- **`App.js`** — replace the `fetch()` body of `sendAudioAndImage` with
  `transcribe → chat → speak`. Add `init`-on-mount + a loading gate that shows
  `LoadingScreen` until ready. Drop `backendUrl`. Everything else (Space-to-talk
  handlers, message state, audio playback, emotion wiring) untouched.
- **`RustyVideo.js`** — delete the webcam capture code (`getUserMedia`,
  `captureImage`, canvas, camera feed). The local text model can't do vision, and
  removing it drops a camera permission prompt. Keep the emotion-video logic.
- **`ChatWindow.js`** — text input routes through local `chat()` + `speak()`
  instead of the backend. Minimal change.
- **Emotion set** — constrain to `happy | sad | neutral` (the three videos that
  exist). Drop `angry`. `RustyVideo` already falls back to neutral for unknowns.
- **System prompt** — port the existing Rusty personality from the old backend
  and crank it to "chaotic, funny, unhinged but PG-13 panda." Same JSON output
  contract: `{ "text": ..., "emotion": "happy|sad|neutral" }`.

### Deletions

- The entire `backend/` folder (FastAPI, `.env`, `.env.example`, `requirements.txt`,
  `google-auth-key.json`, `key.txt`, `test.py`). Rusty becomes a pure static site,
  deployable to GitHub Pages / Vercel with no server.
- Update root `README.md` and `.gitignore` to reflect the static, no-backend setup.

## Data Flow (full turn)

1. User holds Space → `MediaRecorder` captures mic → webm/opus blob on release.
2. `transcribe(blob)` → user text (Whisper, local).
3. `chat(text)` → `{text, emotion}` (Qwen, local).
4. Message log updated; `RustyVideo` plays the matching emotion clip.
5. `speak(text)` → audio buffer (Kokoro, local) → `<audio>` plays it.
6. On audio end, return to idle ("Hold Space to talk").

## Error Handling

- **No WebGPU** → LoadingScreen shows the unsupported-browser message; no load attempt.
- **Model load failure** → error state on LoadingScreen with a retry.
- **Empty/failed transcription** → Rusty says a scripted "huh? say that again 🐼".
- **LLM JSON parse failure** → use raw text, emotion `neutral` (never crash).
- **TTS failure** → fall back to browser-native `SpeechSynthesis` so he still talks.

## Testing

- `localAI.js`: a small self-check that `chat()`'s parser returns valid
  `{text, emotion}` for (a) clean JSON, (b) JSON wrapped in ```` ```json ````
  fences, (c) garbage → neutral fallback.
- Manual: full voice turn with wifi physically off, confirming no network calls
  in DevTools after first load.

## Success Criteria

- After first load, a complete voice turn runs with the network tab showing
  **zero requests** (wifi off).
- First-load total ≈ 600MB; second load boots from cache in seconds.
- Rusty greets the user out loud within a few seconds of first load (before the
  LLM finishes), via the progressive-load scripted greeting.
