import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './App.css';
import RustyVideo from './RustyVideo';
import ChatIcon from './ChatIcon';
import ChatWindow from './ChatWindow';
import Home from './Home';

function AppContent() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingStatus, setRecordingStatus] = useState('Hold Space to Start Recording');
  const [emotion, setEmotion] = useState('neutral');
  const [captureImage, setCaptureImage] = useState(null);
  const [messages, setMessages] = useState([]);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const imageBlobRef = useRef(null);
  const backendUrl = 'http://localhost:8000';

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };

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

  const handleImageCapture = (blob) => {
    imageBlobRef.current = blob;
  };

  const sendAudioAndImage = async (textInput = null) => {
    const formData = new FormData();
    const isTextOnly = !!textInput;

    if (isTextOnly) {
      formData.append('text', textInput);
    } else {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      formData.append('audio', audioBlob, 'input.webm');
      if (imageBlobRef.current) {
        formData.append('image', imageBlobRef.current, 'capture.jpg');
      }
    }

    try {
      const response = await fetch(`${backendUrl}/process-audio`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        setRecordingStatus(`Error: ${errorData.error}`);
        setEmotion('sad');
        return;
      }

      const data = await response.json();
      const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
      handleAudioResponse(audioUrl, data.emotion, data.response_text, data.user_text, isTextOnly);
    } catch (error) {
      setRecordingStatus(`Fetch error: ${error.message}`);
      setEmotion('sad');
    } finally {
      imageBlobRef.current = null;
    }
  };

  const handleSendMessage = (text) => {
    setMessages((prev) => [...prev, { type: 'user', text }]);
    sendAudioAndImage(text);
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
        mediaRecorderRef.current.onstop = () => sendAudioAndImage();

        setCaptureImage(() => true);
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
        setCaptureImage(null);
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
  }, [recordingStatus]);

  const handleAudioEnd = () => {
    setAudioUrl(null);
    setRecordingStatus('Hold Space to Start Recording');
    setEmotion('neutral');
  };

  return (
    <div className="App">
      <RustyVideo emotion={emotion} onCaptureImage={captureImage ? handleImageCapture : null} />
      <ChatIcon onClick={toggleChat} />
      {isChatOpen && (
        <ChatWindow
          onClose={toggleChat}
          backendUrl={backendUrl}
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