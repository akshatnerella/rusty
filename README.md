# Rusty 🐼

**Talk to a chaotic AI red panda that runs entirely in your browser — no servers, no API keys. Turn your wifi off and he still hears you, thinks, and talks back.**

Rusty is a voice-first AI companion where *everything runs locally on your machine* via WebGPU: speech recognition, the language model, and the voice. After a one-time model download, the whole conversation happens on-device — fully offline.

---

## Features

- **100% local** — STT, LLM, and TTS all run in your browser. Zero network calls after the first load.
- **Voice input** — hold Space and talk to Rusty.
- **Chaotic personality** — a funny, unhinged-but-PG-13 red panda who roasts you with love.
- **Emotional avatar** — Rusty reacts with happy / sad / neutral video animations.
- **Talk + type** — speak to him or use the chat window.

## Tech Stack

| Job | Library | Model |
|---|---|---|
| Speech→Text | [Transformers.js](https://github.com/huggingface/transformers.js) | `whisper-tiny.en` |
| Brain | [WebLLM](https://github.com/mlc-ai/web-llm) | `Qwen2.5-0.5B-Instruct` |
| Text→Speech | [kokoro-js](https://github.com/hexgrad/kokoro) | Kokoro-82M |
| UI | React 19 | — |

Everything runs on **WebGPU**. No backend, no API keys.

---

## Requirements

- Node.js 18+
- A **WebGPU browser** — Chrome or Edge on desktop (recommended). No WebGPU = unsupported screen.

## Run it

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000/app`. On first visit, Rusty downloads ~600MB of models (cached in your browser afterward, so later visits boot in seconds and work offline). He'll greet you out loud as soon as his ears and voice load, while the brain finishes in the background.

## Build (static deploy)

```bash
cd frontend
npm run build
```

The `build/` folder is a fully static site — deploy it anywhere (GitHub Pages, Vercel, Netlify). There's no server to run.

---

## How it works

Hold **Space** → your mic records → Whisper transcribes it locally → Qwen generates a reply as `{text, emotion}` → Kokoro speaks it → the avatar plays the matching emotion clip. Every step runs on your device.
