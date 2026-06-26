import { pipeline } from '@huggingface/transformers';
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { KokoroTTS } from 'kokoro-js';
import { parseRustyReply } from './parseReply';

export { parseRustyReply } from './parseReply';

const STT_MODEL = 'onnx-community/whisper-tiny.en';
const LLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TTS_VOICE = 'af_heart'; // swap to taste; one-line change

const SYSTEM_PROMPT = `You are Rusty, a chaotic, hilarious red panda with zero filter (but PG-13 — no slurs, no adult content). You roast your human friend with love, overreact to everything, and keep it short and punchy (1-2 sentences max). Always reply with ONLY a single JSON object, no other text, in this exact shape: {"text": "<your reply>", "emotion": "happy" | "sad" | "neutral"}. Pick the emotion that matches your reply.`;

let stt = null;
let llm = null;
let tts = null;

export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// --- STT (Whisper) ---

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

// --- LLM (Qwen) ---

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

// --- TTS (Kokoro) ---

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

// --- Progressive init: ears + voice first (fast greeting), brain second ---

export async function init({ onProgress, onSpeechReady } = {}) {
  if (!hasWebGPU()) throw new Error('WebGPU not supported');

  await loadSTT();
  await loadTTS();
  onProgress?.(40);
  onSpeechReady?.();

  await loadLLM((p) => onProgress?.(40 + Math.round(p * 60)));
  onProgress?.(100);
}
