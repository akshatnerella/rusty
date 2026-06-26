# Rusty Local Browser AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rusty's API backend with a 100% in-browser pipeline (Whisper STT + Qwen LLM + Kokoro TTS), all running on WebGPU, so a full voice conversation works with the network off.

**Architecture:** The existing React UX layer (Space-to-talk recording, emotion-video avatar, chat window, audio playback) is kept. Only the middle network call is replaced: a new `src/localAI.js` module exposes `init / transcribe / chat / speak`, preserving the `{text, emotion}` contract the avatar already consumes. The `backend/` folder is deleted; Rusty becomes a static site.

**Tech Stack:** React 19 (CRA / react-scripts), `@mlc-ai/web-llm`, `@huggingface/transformers` (Transformers.js), `kokoro-js`, WebGPU.

## Global Constraints

- **WebGPU-only.** No WASM/CPU fallback. Detect `navigator.gpu`; if absent, show an unsupported-browser screen and load nothing.
- **Models (exact ids):** LLM `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`; STT `onnx-community/whisper-tiny.en`; TTS `onnx-community/Kokoro-82M-v1.0-ONNX`. (Verify the LLM id against `@mlc-ai/web-llm`'s `prebuiltAppConfig` model list at implementation time; use the closest `Qwen2.5-0.5B-Instruct-q4f16_1` build if renamed.)
- **Emotion set:** exactly `happy | sad | neutral`. No `angry` (no video for it). Unknown → `neutral`.
- **LLM output contract:** a single JSON object `{"text": "...", "emotion": "happy|sad|neutral"}`. Parsing must never throw — fall back to `{text: <raw or canned>, emotion: "neutral"}`.
- **Personality:** chaotic, funny, unhinged-but-PG-13 red panda. Short replies (1–2 sentences).
- **Testing reality:** WebGPU, `AudioContext`, and model loading do **not** run under CRA's jsdom test environment. Only pure logic (reply parsing) and DOM-gated components (LoadingScreen, RustyVideo) get automated tests. Engine tasks use a **manual verification** step in a real browser — this is intentional, not a skipped test.

---

### Task 1: Reply parser + WebGPU detection (pure, testable core)

**Files:**
- Create: `frontend/src/localAI.js`
- Test: `frontend/src/localAI.test.js`
- Modify: `frontend/package.json` (add dependencies)

**Interfaces:**
- Produces: `parseRustyReply(raw: string) => {text: string, emotion: 'happy'|'sad'|'neutral'}` and `hasWebGPU() => boolean`.

- [ ] **Step 1: Install dependencies**

Run (in `frontend/`):
```bash
npm install @mlc-ai/web-llm @huggingface/transformers kokoro-js
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/localAI.test.js`:
```js
import { parseRustyReply } from './localAI';

test('parses clean JSON', () => {
  expect(parseRustyReply('{"text":"yo!","emotion":"happy"}'))
    .toEqual({ text: 'yo!', emotion: 'happy' });
});

test('strips ```json fences', () => {
  const raw = '```json\n{"text":"hi","emotion":"sad"}\n```';
  expect(parseRustyReply(raw)).toEqual({ text: 'hi', emotion: 'sad' });
});

test('unknown emotion falls back to neutral', () => {
  expect(parseRustyReply('{"text":"ok","emotion":"angry"}'))
    .toEqual({ text: 'ok', emotion: 'neutral' });
});

test('garbage falls back to raw text + neutral', () => {
  expect(parseRustyReply('just words')).toEqual({ text: 'just words', emotion: 'neutral' });
});

test('empty input yields a canned line', () => {
  expect(parseRustyReply('').emotion).toBe('neutral');
  expect(parseRustyReply('').text.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/localAI.test.js`
Expected: FAIL — `parseRustyReply is not a function` / module not found.

- [ ] **Step 4: Write minimal implementation**

Create `frontend/src/localAI.js`:
```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/localAI.test.js`
Expected: PASS (5 passing).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/localAI.js frontend/src/localAI.test.js frontend/package.json frontend/package-lock.json
git commit -m "feat: add reply parser, WebGPU detect, and local-AI deps"
```

---

### Task 2: STT engine — `transcribe()`

**Files:**
- Modify: `frontend/src/localAI.js`

**Interfaces:**
- Consumes: nothing from prior tasks at runtime.
- Produces: `transcribe(blob: Blob) => Promise<string>` and internal `blobToMono16k(blob) => Promise<Float32Array>`. Sets module-level `stt`.

- [ ] **Step 1: Add the STT code**

At the top of `frontend/src/localAI.js`, add the import and module state:
```js
import { pipeline } from '@huggingface/transformers';

const STT_MODEL = 'onnx-community/whisper-tiny.en';
let stt = null;
```

At the bottom of `frontend/src/localAI.js`, add:
```js
// decode a webm/opus blob to mono Float32 @16kHz (what Whisper expects)
async function blobToMono16k(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  await ctx.close();
  return rendered.getChannelData(0);
}

export async function loadSTT() {
  stt = await pipeline('automatic-speech-recognition', STT_MODEL, { device: 'webgpu' });
}

export async function transcribe(blob) {
  const audio = await blobToMono16k(blob);
  const out = await stt(audio);
  return (out?.text || '').trim();
}
```

- [ ] **Step 2: Manual verification (real browser — jsdom can't run WebGPU)**

In `frontend/`, temporarily add to `src/index.js` (or a scratch component) a button that records 2s of mic audio and calls `loadSTT()` then `transcribe(blob)`, logging the result. Run `npm start`, speak "testing one two three", confirm the console logs roughly that text. Remove the scratch code after.
Expected: transcript text logged, no network requests in DevTools after first model download.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/localAI.js
git commit -m "feat: local Whisper STT (transcribe)"
```

---

### Task 3: LLM engine — `chat()`

**Files:**
- Modify: `frontend/src/localAI.js`

**Interfaces:**
- Consumes: `parseRustyReply` (Task 1).
- Produces: `chat(text: string) => Promise<{text, emotion}>`, `loadLLM(onProgress?)`. Sets module-level `llm`.

- [ ] **Step 1: Add the LLM code**

At the top of `frontend/src/localAI.js`, add:
```js
import { CreateMLCEngine } from '@mlc-ai/web-llm';

const LLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
let llm = null;

const SYSTEM_PROMPT = `You are Rusty, a chaotic, hilarious red panda with zero filter (but PG-13 — no slurs, no adult content). You roast your human friend with love, overreact to everything, and keep it short and punchy (1-2 sentences max). Always reply with ONLY a single JSON object, no other text, in this exact shape: {"text": "<your reply>", "emotion": "happy" | "sad" | "neutral"}. Pick the emotion that matches your reply.`;
```

At the bottom of `frontend/src/localAI.js`, add:
```js
export async function loadLLM(onProgress) {
  llm = await CreateMLCEngine(LLM_MODEL, {
    initProgressCallback: (p) => onProgress?.(p.progress),
  });
}

export async function chat(text) {
  const res = await llm.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    temperature: 1.0,
  });
  return parseRustyReply(res.choices[0].message.content);
}
```

- [ ] **Step 2: Manual verification (real browser)**

Scratch-test as in Task 2: call `await loadLLM(p => console.log(p))` then `console.log(await chat('hey rusty'))`. Run `npm start`.
Expected: an object `{text, emotion}` with a short funny line and a valid emotion. Run it 3–4 times to confirm the parser never throws even when the 0.5B model returns messy output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/localAI.js
git commit -m "feat: local Qwen LLM (chat) with Rusty personality"
```

---

### Task 4: TTS engine — `speak()` with native fallback

**Files:**
- Modify: `frontend/src/localAI.js`

**Interfaces:**
- Produces: `speak(text: string) => Promise<string|null>` (returns an object-URL for a wav blob, or `null` if it fell back to native speech), `loadTTS()`. Sets module-level `tts`.

- [ ] **Step 1: Add the TTS code**

At the top of `frontend/src/localAI.js`, add:
```js
import { KokoroTTS } from 'kokoro-js';

const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TTS_VOICE = 'af_heart'; // swap to taste; one-line change
let tts = null;
```

At the bottom of `frontend/src/localAI.js`, add:
```js
export async function loadTTS() {
  tts = await KokoroTTS.from_pretrained(TTS_MODEL, { dtype: 'q8', device: 'webgpu' });
}

export async function speak(text) {
  try {
    const audio = await tts.generate(text, { voice: TTS_VOICE });
    return URL.createObjectURL(audio.toBlob());
  } catch (e) {
    // fallback: he still talks, just with the robotic browser voice
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
    return null;
  }
}
```

- [ ] **Step 2: Manual verification (real browser)**

Scratch-test: `await loadTTS(); const url = await speak('hello human friend'); new Audio(url).play();` Run `npm start`.
Expected: you hear Kokoro speak the line. Then temporarily break the model id to confirm the `SpeechSynthesis` fallback still talks.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/localAI.js
git commit -m "feat: local Kokoro TTS (speak) with native fallback"
```

---

### Task 5: Progressive `init()` orchestrator

**Files:**
- Modify: `frontend/src/localAI.js`

**Interfaces:**
- Consumes: `hasWebGPU`, `loadSTT`, `loadTTS`, `loadLLM` (Tasks 1–4).
- Produces: `init({ onProgress?, onSpeechReady? }) => Promise<void>`. Loads STT+TTS first (so a greeting can play), then the LLM. `onProgress` receives 0–100.

- [ ] **Step 1: Add the orchestrator**

At the bottom of `frontend/src/localAI.js`, add:
```js
export async function init({ onProgress, onSpeechReady } = {}) {
  if (!hasWebGPU()) throw new Error('WebGPU not supported');

  // Phase 1: ears + voice first, so Rusty can greet within seconds
  await loadSTT();
  await loadTTS();
  onProgress?.(40);
  onSpeechReady?.();

  // Phase 2: the brain (the big download) streams in behind the greeting
  await loadLLM((p) => onProgress?.(40 + Math.round(p * 60)));
  onProgress?.(100);
}
```

- [ ] **Step 2: Manual verification (real browser)**

Scratch-test: `init({ onProgress: console.log, onSpeechReady: () => console.log('SPEECH READY') })`. Run `npm start`.
Expected: progress logs climb 0→40, "SPEECH READY" fires *before* the LLM finishes, then progress reaches 100.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/localAI.js
git commit -m "feat: progressive init (speech first, brain second)"
```

---

### Task 6: LoadingScreen component + WebGPU gate

**Files:**
- Create: `frontend/src/LoadingScreen.js`
- Create: `frontend/src/LoadingScreen.css`
- Test: `frontend/src/LoadingScreen.test.js`

**Interfaces:**
- Consumes: nothing (pure presentational; parent passes props).
- Produces: `<LoadingScreen progress={number} supported={boolean} />` — renders the unsupported message when `supported` is false, otherwise a progress bar.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/LoadingScreen.test.js`:
```js
import { render, screen } from '@testing-library/react';
import LoadingScreen from './LoadingScreen';

test('shows unsupported message when WebGPU missing', () => {
  render(<LoadingScreen progress={0} supported={false} />);
  expect(screen.getByText(/WebGPU/i)).toBeInTheDocument();
});

test('shows progress when supported', () => {
  render(<LoadingScreen progress={42} supported={true} />);
  expect(screen.getByText(/42/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/LoadingScreen.test.js`
Expected: FAIL — cannot find module `./LoadingScreen`.

- [ ] **Step 3: Write the component**

Create `frontend/src/LoadingScreen.css`:
```css
.loading-screen {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100vh; gap: 16px; font-family: sans-serif; text-align: center; padding: 24px;
}
.loading-bar { width: 260px; height: 12px; background: #eee; border-radius: 6px; overflow: hidden; }
.loading-bar > div { height: 100%; background: #c0622d; transition: width .3s ease; }
```

Create `frontend/src/LoadingScreen.js`:
```js
import './LoadingScreen.css';

export default function LoadingScreen({ progress, supported }) {
  if (!supported) {
    return (
      <div className="loading-screen">
        <h2>🐼 Rusty needs a WebGPU browser</h2>
        <p>Open this in Chrome or Edge on a desktop to wake him up.</p>
      </div>
    );
  }
  return (
    <div className="loading-screen">
      <h2>🐼 Waking up Rusty…</h2>
      <div className="loading-bar"><div style={{ width: `${progress}%` }} /></div>
      <p>{progress}%</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/LoadingScreen.test.js`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/LoadingScreen.js frontend/src/LoadingScreen.css frontend/src/LoadingScreen.test.js
git commit -m "feat: LoadingScreen with WebGPU gate"
```

---

### Task 7: Wire `App.js` to the local pipeline

**Files:**
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: `init`, `hasWebGPU`, `transcribe`, `chat`, `speak` (Tasks 1–5); `LoadingScreen` (Task 6).
- Produces: a working `AppContent` that loads models on mount, greets on speech-ready, and runs `transcribe → chat → speak` per turn.

- [ ] **Step 1: Replace imports and the network call**

In `frontend/src/App.js`, add near the top imports:
```js
import LoadingScreen from './LoadingScreen';
import { init, hasWebGPU, transcribe, chat, speak } from './localAI';
```

Add load state inside `AppContent` (next to the other `useState` calls), and remove the `backendUrl` constant:
```js
const [ready, setReady] = useState(false);
const [progress, setProgress] = useState(0);
const supported = hasWebGPU();
```

Add a mount effect that loads models and greets when speech is ready:
```js
useEffect(() => {
  if (!supported) return;
  init({
    onProgress: setProgress,
    onSpeechReady: async () => {
      const greeting = "yo yo yo! my brain's still booting but i can already hear you 🐼";
      setMessages((prev) => [...prev, { type: 'rusty', text: greeting }]);
      const url = await speak(greeting);
      if (url) setAudioUrl(url);
    },
  }).then(() => setReady(true)).catch((e) => console.error('init failed', e));
}, [supported]);
```

Replace the entire body of `sendAudioAndImage` with the local pipeline (drop the image path — vision is out of scope):
```js
const sendAudioAndImage = async (textInput = null) => {
  try {
    let userText = textInput;
    if (!userText) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      userText = await transcribe(audioBlob);
    }
    if (!userText) {
      setRecordingStatus('Hold Space to Start Recording');
      return;
    }
    const { text, emotion } = await chat(userText);
    const url = await speak(text);
    handleAudioResponse(url, emotion, text, userText, !!textInput);
  } catch (error) {
    setRecordingStatus(`Error: ${error.message}`);
    setEmotion('sad');
  }
};
```

In `handleAudioResponse`, `setAudioUrl(url)` may now receive `null` (native-speech fallback); guard the `<audio>` render (already conditional on `audioUrl`), so no change needed there.

- [ ] **Step 2: Gate render on load state**

In `AppContent`'s `return`, wrap the existing markup:
```js
if (!supported) return <LoadingScreen progress={0} supported={false} />;
if (!ready && progress < 40) return <LoadingScreen progress={progress} supported={true} />;
// otherwise render the existing <div className="App"> ... </div>
```
(Render the app once speech is ready at 40% so the greeting plays while the brain finishes; the Space-to-talk turn will simply await `chat()` if the user talks before the LLM is done.)

- [ ] **Step 3: Manual verification (real browser)**

Run `npm start`, open `/app`. Expected: LoadingScreen shows, progresses to 40%, Rusty greets out loud, bar continues to 100%. Then hold Space, say something, release: he transcribes, replies (avatar shows the emotion clip), and speaks. Open DevTools Network and confirm no requests during a turn (after first load). Toggle wifi off and confirm a turn still works.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: wire App to local transcribe/chat/speak pipeline"
```

---

### Task 8: Trim `RustyVideo.js` (remove webcam, lock emotion set)

**Files:**
- Modify: `frontend/src/RustyVideo.js`
- Test: `frontend/src/RustyVideo.test.js`

**Interfaces:**
- Consumes: `emotion` prop (`happy|sad|neutral`).
- Produces: `<RustyVideo emotion={string} />` — renders the matching `/videos/<emotion>.mp4`, no camera.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/RustyVideo.test.js`:
```js
import { render } from '@testing-library/react';
import RustyVideo from './RustyVideo';

test('renders the video for the given emotion', () => {
  const { container } = render(<RustyVideo emotion="happy" />);
  const video = container.querySelector('video.rusty-video');
  expect(video.getAttribute('src')).toContain('happy.mp4');
});

test('falls back to neutral for unknown emotion', () => {
  const { container } = render(<RustyVideo emotion="angry" />);
  const video = container.querySelector('video.rusty-video');
  expect(video.getAttribute('src')).toContain('neutral.mp4');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/RustyVideo.test.js`
Expected: FAIL — current component starts a camera (`getUserMedia` undefined in jsdom) and references `onCaptureImage`; test errors or asserts wrong src.

- [ ] **Step 3: Rewrite the component without the camera**

Replace the entire contents of `frontend/src/RustyVideo.js`:
```js
import React, { useState, useEffect, useRef } from 'react';

const VIDEOS = {
  neutral: '/videos/neutral.mp4',
  happy: '/videos/happy.mp4',
  sad: '/videos/sad.mp4',
};

const RustyVideo = ({ emotion: propEmotion }) => {
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const videoRef = useRef(null);

  useEffect(() => {
    if (propEmotion && VIDEOS[propEmotion] && propEmotion !== currentEmotion) {
      setCurrentEmotion(propEmotion);
    }
  }, [propEmotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVideoEnd = () => {
    if (currentEmotion !== 'neutral') setCurrentEmotion('neutral');
  };

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        className="rusty-video"
        src={VIDEOS[currentEmotion] || VIDEOS.neutral}
        autoPlay
        loop={currentEmotion === 'neutral'}
        muted
        onEnded={handleVideoEnd}
      />
      <div className="video-overlay">
        <span>Rusty the Red Panda</span>
      </div>
    </div>
  );
};

export default RustyVideo;
```

In `frontend/src/App.js`, remove the now-dead webcam wiring: delete the `captureImage` state, `handleImageCapture`, `imageBlobRef`, the `setCaptureImage(...)` calls in the recording effect, and change the render to `<RustyVideo emotion={emotion} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/RustyVideo.test.js`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/RustyVideo.js frontend/src/RustyVideo.test.js frontend/src/App.js
git commit -m "refactor: drop webcam from RustyVideo, lock emotion set to 3"
```

---

### Task 9: Route `ChatWindow` text through the local pipeline

**Files:**
- Modify: `frontend/src/App.js` (the `handleSendMessage` handler)

**Interfaces:**
- Consumes: `chat`, `speak` via the existing `sendAudioAndImage(textInput)` path (Task 7 already handles `textInput`).
- Produces: typed messages produce a spoken + animated reply, same as voice.

- [ ] **Step 1: Confirm the text path**

`handleSendMessage` already calls `sendAudioAndImage(text)`, and Task 7's rewrite handles `textInput` by skipping transcription and going straight to `chat → speak`. Verify `ChatWindow` is rendered without `backendUrl` (remove that prop from the `<ChatWindow ... />` in `App.js` if still present).

- [ ] **Step 2: Manual verification (real browser)**

Run `npm start`, open the chat window, type "tell me a joke", send.
Expected: Rusty's reply appears in the log, the avatar animates the emotion, and he speaks it — no network calls.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: route typed chat through local pipeline"
```

---

### Task 10: Delete backend, update README and .gitignore

**Files:**
- Delete: `backend/` (entire folder)
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:** none (cleanup + docs).

- [ ] **Step 1: Delete the backend**

```bash
git rm -r backend
```

- [ ] **Step 2: Update README**

Replace the Setup, Tech Stack, and Environment Variables sections of `README.md` to describe a static, no-backend app: prerequisites are just Node + a WebGPU browser; run `cd frontend && npm install && npm start`; note the ~600MB one-time model download cached in the browser; remove all API-key / `.env` instructions. Keep the feature blurb and the "wifi off" hook.

- [ ] **Step 3: Trim .gitignore**

Remove the now-irrelevant `backend/*` lines from `.gitignore` (the `.env`, `google-auth-key.json`, `key.txt`, temp-file rules). Keep the frontend and OS rules.

- [ ] **Step 4: Manual verification**

Run `npm test -- --watchAll=false` (all suites) and `npm start` once more to confirm the app still loads with no backend present.
Expected: tests pass; app runs.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete backend, make Rusty a static no-API app"
```

---

## Self-Review

**Spec coverage:**
- Local stack (Whisper/Qwen/Kokoro) → Tasks 2,3,4. ✓
- Progressive load + scripted greeting → Tasks 5,7. ✓
- `{text, emotion}` contract + neutral fallback → Tasks 1,3. ✓
- LoadingScreen + WebGPU gate → Task 6. ✓
- App rewire, drop vision/webcam → Tasks 7,8. ✓
- Emotion set locked to 3 → Tasks 1,8. ✓
- Chat text path → Task 9. ✓
- Delete backend, static site, README/.gitignore → Task 10. ✓
- Personality crank → Task 3 system prompt. ✓
- Error handling (no WebGPU, parse fail, TTS fail) → Tasks 1,4,6,7. ✓

**Placeholder scan:** No TBD/TODO; every code step has runnable code. Manual-verification steps are deliberate (jsdom can't run WebGPU) and each names a concrete expected result.

**Type consistency:** `parseRustyReply`, `hasWebGPU`, `init({onProgress,onSpeechReady})`, `transcribe`, `chat`→`{text,emotion}`, `speak`→`string|null` used consistently across Tasks 1–9. `loadSTT/loadTTS/loadLLM` defined in 2/4/3 and consumed only by `init` in 5. ✓
