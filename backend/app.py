import os
import tempfile
from dotenv import load_dotenv
from colorama import Fore, init
import logging
import json
import re
from apiclient.discovery import build
from oauth2client.client import GoogleCredentials
import base64
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
import requests
import time


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
init(autoreset=True)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audio settings
SAMPLE_RATE = 48000

# API settings
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if not GOOGLE_CREDENTIALS_PATH or not os.path.exists(GOOGLE_CREDENTIALS_PATH):
    logging.warning("GOOGLE_APPLICATION_CREDENTIALS not set or invalid.")
    GOOGLE_CREDENTIALS_PATH = input("Please enter the path to your google-credentials.json: ")
    if not os.path.exists(GOOGLE_CREDENTIALS_PATH):
        raise ValueError("Invalid credentials path provided.")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
if not ELEVENLABS_API_KEY:
    logging.warning("ELEVENLABS_API_KEY not found in environment variables.")
    ELEVENLABS_API_KEY = input("Please enter your ELEVENLABS_API_KEY manually: ")
if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY not found in environment variables.")
    GEMINI_API_KEY = input("Please enter your GEMINI_API_KEY manually: ")
import google.generativeai as genai
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-pro')
VOICE_ID = "UJmnuQHxF3oiwGZ3hKpp"
ELEVENLABS_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

# Google STT client
credentials = GoogleCredentials.get_application_default()
speech_service = build('speech', 'v1', credentials=credentials)

# Track conversation history as a list of dicts
conversation_history = [
    {
        "role": "system",
        "content": "You are a friendly red panda named Rusty. Respond to a human friend with a cheerful tone, using children-appropriate language. Your human friend is PG-13 so make sure no bad words or things they shouldn't know. Your output must be a single valid JSON object with exactly two fields: 'text' (the response message) and 'emotion' (one of: happy, sad, neutral, angry). Choose the emotion properly and accurately based on the context. If an image is provided, describe it briefly and incorporate it into your response. Use the conversation history to stay on topic and build on what was said before. Example with image: {'text': 'Wow, that’s a cool toy! I’d love to play with it! 🐼😊', 'emotion': 'happy'}. Example without image: {'text': 'Hello, human friend! 🐼😊', 'emotion': 'happy'}. If the input is unclear, return {'text': 'Can you repeat that? 🐼😢', 'emotion': 'sad'}."
    }
]

def cleanup_temp_file(file_path):
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            logging.info(f"Deleted temp file: {file_path}")
        except Exception as e:
            logging.error(f"Failed to delete {file_path}: {e}")

def transcribe_audio(audio_file):
    start_time = time.time()
    try:
        with open(audio_file, "rb") as f:
            content = f.read()
        audio_base64 = base64.b64encode(content).decode('utf-8')

        request_body = {
            "config": {
                "encoding": "WEBM_OPUS",
                "sampleRateHertz": SAMPLE_RATE,
                "languageCode": "en-US"
            },
            "audio": {
                "content": audio_base64
            }
        }

        response = speech_service.speech().recognize(body=request_body).execute()
        if "results" in response and response["results"]:
            text = response["results"][0]["alternatives"][0]["transcript"]
            logging.info(f"Transcription completed in {time.time() - start_time:.2f}s")
            return text
        logging.info(f"Transcription completed (no text) in {time.time() - start_time:.2f}s")
        return ""
    except Exception as e:
        logging.error(f"Google STT error: {str(e)} in {time.time() - start_time:.2f}s")
        return None

def retrieve_relevant_context(user_text):
    if not user_text or len(conversation_history) <= 1:  # Only system prompt
        return []
    words = set(user_text.lower().split())
    relevant = []
    # Always include the last turn for flow
    if len(conversation_history) > 1:
        last_turn = conversation_history[-1]
        relevant.append(last_turn)
    # Add older turns if they match keywords (up to 3 more)
    for entry in conversation_history[1:-1][-3:]:  # Skip system and last, take 3 before
        if "content" in entry:
            content = entry["content"].lower()
            if any(word in content for word in words):
                relevant.append(entry)
    return relevant

def generate_response(user_text, image_path=None):
    start_time = time.time()
    try:
        if not user_text and not image_path:
            response = {'text': 'Can you repeat that or show me something? 🐼😢', 'emotion': 'sad'}
            conversation_history.append({"role": "assistant", "content": json.dumps(response)})
            return response

        # Build prompt as a list of parts
        prompt_parts = [
            {"text": conversation_history[0]["content"]}  # System instruction
        ]
        
        # Add relevant context as text parts
        context = retrieve_relevant_context(user_text)
        if context:
            context_text = "Conversation history (use this to stay on topic):\n"
            for entry in context:
                role = entry["role"]
                content = json.loads(entry["content"]) if role == "assistant" else entry["content"]
                context_text += f"{role.capitalize()}: {content['text'] if role == 'assistant' else content}\n"
            prompt_parts.append({"text": context_text})
        
        # Add current user input
        if user_text:
            prompt_parts.append({"text": f"User: {user_text}"})
            conversation_history.append({"role": "user", "content": user_text})
        
        # Add image if present
        if image_path:
            with open(image_path, "rb") as img_file:
                image_data = img_file.read()
            prompt_parts.append({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": image_data
                }
            })
            logging.info(f"Image added to prompt: {image_path}")

        # Send to Gemini
        response = model.generate_content(prompt_parts)
        ai_response = response.text.strip()

        logging.debug(f"Raw Gemini response: {ai_response}")
        cleaned_response = re.sub(r'```json\s*|\s*```', '', ai_response).strip()

        try:
            parsed_response = json.loads(cleaned_response)
            if not (isinstance(parsed_response, dict) and 'text' in parsed_response and 'emotion' in parsed_response):
                raise ValueError("Response must contain 'text' and 'emotion'")
            ai_text = parsed_response['text']
            emotion = parsed_response['emotion']
            if emotion not in ['happy', 'sad', 'neutral', 'angry']:
                emotion = 'neutral'
            logging.info(f"Gemini response: {{'text': '{ai_text}', 'emotion': '{emotion}'}} in {time.time() - start_time:.2f}s")
            conversation_history.append({"role": "assistant", "content": json.dumps({'text': ai_text, 'emotion': emotion})})
            return {'text': ai_text, 'emotion': emotion}
        except (json.JSONDecodeError, ValueError) as e:
            logging.error(f"Invalid JSON or structure: {str(e)} - Raw: {cleaned_response}")
            response = {'text': 'Can you repeat that? 🐼😢', 'emotion': 'sad'}
            conversation_history.append({"role": "assistant", "content": json.dumps(response)})
            return response
    except Exception as e:
        logging.error(f"Gemini error: {str(e)}")
        response = {'text': 'Can you repeat that? 🐼😢', 'emotion': 'sad'}
        conversation_history.append({"role": "assistant", "content": json.dumps(response)})
        return response

def text_to_speech(text):
    start_time = time.time()
    try:
        headers = {
            "accept": "audio/mpeg",
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
        }
        data = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5
            }
        }
        response = requests.post(ELEVENLABS_URL, json=data, headers=headers)
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
            fp.write(response.content)
            logging.info(f"TTS completed in {time.time() - start_time:.2f}s: {fp.name}")
            return fp.name
    except Exception as e:
        logging.error(f"Speech generation error with ElevenLabs: {str(e)} in {time.time() - start_time:.2f}s")
        return None

@app.post("/process-audio")
async def process_audio(
    audio: UploadFile = File(None),
    image: UploadFile = File(None),
    text: str = Form(None)
):
    total_start_time = time.time()
    audio_path = f"input_{int(total_start_time)}.webm" if audio else None
    image_path = None
    response_audio = None
    
    try:
        if audio:
            with open(audio_path, "wb") as f:
                f.write(await audio.read())
        
        if image:
            image_path = f"image_{int(total_start_time)}.jpg"
            with open(image_path, "wb") as f:
                f.write(await image.read())
            logging.info(f"Received image: {image_path}")

        if text is not None:
            user_text = text
            logging.info(Fore.GREEN + f"You typed: {user_text}" + Fore.RESET)
        elif audio_path:
            user_text = transcribe_audio(audio_path)
            logging.info(Fore.GREEN + f"You said: {user_text or 'nothing, but sent an image'}" + Fore.RESET)
        else:
            user_text = None

        if user_text or image_path:
            response = generate_response(user_text, image_path)
            response_text = response['text']
            emotion = response['emotion']

            if user_text and "goodbye" in user_text.lower():
                logging.info("Goodbye received, closing connection.")
                response_text = "Goodbye, human friend! 🐼👋"
                emotion = "happy"

            logging.info(Fore.CYAN + f"Rusty says: {response_text}" + Fore.RESET)
            
            response_audio = text_to_speech(response_text)
            if response_audio:
                logging.info(f"Total time: {time.time() - total_start_time:.2f}s")
                with open(response_audio, "rb") as audio_file:
                    audio_content = audio_file.read()
                audio_base64 = base64.b64encode(audio_content).decode('utf-8')
                response_data = {
                    "audio": audio_base64,
                    "response_text": response_text,
                    "emotion": emotion,
                    "user_text": user_text or ""
                }
                return JSONResponse(
                    content=response_data,
                    background=BackgroundTask(cleanup_temp_file, response_audio)
                )
            else:
                logging.error("No audio generated.")
                return JSONResponse(content={"error": "Failed to generate audio response"}, status_code=500)
        else:
            logging.info("No text or image provided.")
            return JSONResponse(content={"error": "No input provided"}, status_code=400)
    finally:
        if audio_path:
            cleanup_temp_file(audio_path)
        if image_path:
            cleanup_temp_file(image_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)