// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [status, setStatus] = useState('Click the button to start recording');
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState('');
  const silenceStartRefInit = useRef(Date.now());

  useEffect(() => {
    socket.on('stop_mike', () => {
      stopSpeechRecognition();
    });
    socket.on('receive_audio', (data) => {
      setTranscription(data.transcription);
      setResponse(data.response);
      stopSpeechRecognition();
      const audio = new Audio(data.audioUrl);
      audio.play();
      setStatus('Playing response...');
      audio.onended = () => {
        setStatus('Listening...');
        if (isAutoRecording) {
          silenceStartRefInit.current = Date.now();
          startSpeechRecognition();
        }
      };
    });

    socket.on('error', (errorMessage) => {
      console.error('Server error:', errorMessage);
      setStatus('Error: ' + errorMessage);
    });

    return () => {
      socket.off('receive_audio');
      socket.off('error');
    };
  }, [isAutoRecording]);

  const toggleAutoRecording = () => {
    if (!isAutoRecording) {
      setIsAutoRecording(true);
      silenceStartRefInit.current = Date.now();
      startSpeechRecognition();
    } else {
      setIsAutoRecording(false);
      stopSpeechRecognition();
      setStatus('Auto-recording stopped');
    }
  };

  const startSpeechRecognition =  () => {

    setIsRecording(true);
    setStatus('Listening...');
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript) {
            console.log('Recognized speech:', transcript);
            socket.emit('recognized_speech', transcript); // Emit recognized speech
          }
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setStatus('Speech recognition error');
    };

    recognition.onend = () => {
      if (isRecording) {
        recognition.start(); // Restart recognition if still recording
      }
    };

    recognition.start();
    // Save recognition instance to stop it later
    window.recognitionInstance = recognition;
  };

  const stopSpeechRecognition = () => {
    if (window.recognitionInstance) {
      window.recognitionInstance.stop();
      window.recognitionInstance = null;
    }
  };

  return (
    <div className="App">
      <h1>Real-Time Audio Chat</h1>
      <button onClick={toggleAutoRecording}>
        {isAutoRecording ? 'Stop Auto-recording' : 'Start Auto-recording'}
      </button>
      <p>{status}</p>
      {transcription && <p>Transcription: {transcription}</p>}
      {response && <p>Response: {response}</p>}
    </div>
  );
}

export default App;
