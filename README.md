# Rusty 🐼

**Talk to an AI red panda that listens, thinks, and talks back — in real time.**

Rusty is a voice-first AI companion powered by Google Gemini, ElevenLabs TTS, and Google Speech-to-Text. Speak to him, show him a photo, or type — he responds with personality, emotion, and his own voice.

---

## Features

- **Voice input** — speak directly to Rusty via your microphone
- **Image understanding** — share a photo and Rusty reacts to it
- **Emotional responses** — Rusty expresses happy, sad, neutral, or angry moods with matching animations
- **Natural voice output** — powered by ElevenLabs text-to-speech
- **Conversation memory** — keeps context across turns so the chat flows naturally

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, React Router |
| Backend | FastAPI, Python |
| Speech-to-Text | Google Cloud Speech API |
| AI / LLM | Google Gemini 1.5 Pro |
| Text-to-Speech | ElevenLabs |

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Google Cloud project with Speech-to-Text API enabled
- Gemini API key
- ElevenLabs API key

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt

cp .env.example .env
# Fill in your keys in .env
```

```bash
uvicorn app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start
```

App runs at `http://localhost:3000`. Backend must be running on port `8000`.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your Google service account JSON |

Never commit your `.env` or credentials file.
