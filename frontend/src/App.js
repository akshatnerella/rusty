import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './App.css';
import RustyVideo from './RustyVideo';
import ChatIcon from './ChatIcon';
import ChatWindow from './ChatWindow';
import Home from './Home';
import LoadingScreen from './LoadingScreen';
import { init, hasWebGPU, transcribe, chat, speak } from './localAI';

function AppContent() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingStatus, setRecordingStatus] = useState('Hold Space to Start Recording');
  const [emotion, setEmotion] = useState('neutral');
  const [messages, setMessages] = useState([]);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const supported = hasWebGPU();
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };

  // Load the local models on mount; greet out loud once ears+voice are ready.
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
    })
      .then(() => setReady(true))
      .catch((e) => console.error('init failed', e));
  }, [supported]);

  const handleAudioResponse = (url, emotionFromResponse, responseText, userText, isTextOnly = false) => {
    setAudioUrl(url);
    setEmotion(emotionFromResponse);
    setRecordingStatus('Rusty is Speaking...');
    if (!isTextOnly && userText && !messages.some(msg => msg.type === 'user' && msg.text === userText)) {
      setMessages((prev) => [...prev, { type: 'user', text: userText }]);
    }
    if (responseText) {
      setMessages((prev) => [...prev, { type: 'rusty', text: responseText }]);
    }
  };

  const runTurn = async (textInput = null) => {
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
      setRecordingStatus('Rusty is thinking...');
      const { text, emotion: replyEmotion } = await chat(userText);
      const url = await speak(text);
      handleAudioResponse(url, replyEmotion, text, userText, !!textInput);
    } catch (error) {
      setRecordingStatus(`Error: ${error.message}`);
      setEmotion('sad');
    }
  };

  const handleSendMessage = (text) => {
    setMessages((prev) => [...prev, { type: 'user', text }]);
    runTurn(text);
  };

  useEffect(() => {
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = () => runTurn();

        mediaRecorderRef.current.start();
        setRecordingStatus('Recording...');
      } catch (error) {
        console.error('Recording error:', error);
        setRecordingStatus(`Error: ${error.message}`);
        setEmotion('sad');
      }
    };

    const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        setRecordingStatus('Processing...');
      }
    };

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && recordingStatus === 'Hold Space to Start Recording' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && recordingStatus === 'Recording...') {
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingStatus]);

  const handleAudioEnd = () => {
    setAudioUrl(null);
    setRecordingStatus('Hold Space to Start Recording');
    setEmotion('neutral');
  };

  if (!supported) return <LoadingScreen progress={0} supported={false} />;
  if (!ready && progress < 40) return <LoadingScreen progress={progress} supported={true} />;

  return (
    <div className="App">
      <RustyVideo emotion={emotion} />
      <ChatIcon onClick={toggleChat} />
      {isChatOpen && (
        <ChatWindow
          onClose={toggleChat}
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      )}
      <div className="recording-status">
        {recordingStatus}
      </div>
      {audioUrl && (
        <audio
          autoPlay
          src={audioUrl}
          onEnded={handleAudioEnd}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
