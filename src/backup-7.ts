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
  const recognitionRef = useRef(null);
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

  const startSpeechRecognition = async () => {
    setIsRecording(true);
    setStatus('Listening...');
    if (!('webkitSpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      setStatus('Speech recognition not supported');
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMicrophone = devices.some(device => device.kind === 'audioinput');
      if (!hasMicrophone) {
        throw new Error('No microphone found');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Close the stream as it's only used to request permission

      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
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
        setStatus('Speech recognition error: ' + event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopSpeechRecognition();
        }
      };

      recognition.onend = () => {
        if (isRecording) {
          console.log('Speech recognition ended, restarting...');
          recognition.start(); // Restart recognition if still recording
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setStatus('Error accessing microphone: ' + error.message);
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent restarting when stopped
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      setStatus('Stopped recording');
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
