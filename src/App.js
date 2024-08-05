// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io(process.env.REACT_APP_BACKEND_URL, {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2NjBkMjFkYjBhOTNjZTNmZTM3M2Y5NTEiLCJmaXJzdE5hbWUiOiJKb2huNCIsImxhc3ROYW1lIjoiRG9lNCIsImVtYWlsIjoidXNlcjRAZXhhbXBsZS5jb20iLCJyb2xlIjoic2FsZXNBZG1pbiIsInJvbGVJZCI6IjY2MDNmZmI3Y2Q1YWI4MjI0MDcwNDI4NCIsImFjY291bnRJZCI6IjY2MGMwMTRmYzMxZGRmMzYxYjJiZjcxMCIsImxhbmd1YWdlIjoiRW5nbGlzaCIsImlhdCI6MTcyMjMyNDMyMiwiZXhwIjoxNzQzOTI0MzIyfQ.5WD2i1T8QSS8aTzB56G_jnec5aek1jHNFWCHSrmutUo'
  }
});


const SILENCE_THRESHOLD = 0.03;
const START_THRESHOLD = 0.06;
const SILENCE_DURATION = 2000; // 2 seconds

function App() {
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [status, setStatus] = useState('Click the button to start recording');
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState('');
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const silenceStartRef = useRef(null);
  const silenceStartRefInit = useRef(null);
  const isStarted = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const mikeStaredOnRef = useRef(null);

  const hadSpeechRef = useRef(false); // Track if speech was detected

  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    socket.on('stop_mike', () => {
    });


    socket.on('receive_audio', (data) => {
      console.log("aya hua data: ", data, "\n")
      setTranscription(data?.transcription || '');
      setResponse(data?.response || '');
      setIsAutoRecording(false);
      if (isAutoRecording) {
        stopRecording();
      }
      setAudioQueue(prevQueue => [...prevQueue, data.audioUrl]);
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


  useEffect(() => {
    if (audioQueue.length > 0 && !isPlaying) {
      playNextAudio();
    }
  }, [audioQueue, isPlaying]);

  const playNextAudio = () => {
    console.log("dsfsfsfsfs: ", audioQueue)
    if (audioQueue.length === 0) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    const nextAudioUrl = audioQueue[0];
    if (nextAudioUrl === 'FINISHED') {
      console.log("********FINED*********")
      setAudioQueue([])
      setIsPlaying(false);
      silenceStartRef.current = null;
      setStatus('Listening...');
      // // if (isAutoRecording) {
      silenceStartRef.current = Date.now();
      setIsAutoRecording(true);
      startRecording();
    } else {
      const audio = new Audio(nextAudioUrl);
      audio.play();
      audio.onended = () => {
        setAudioQueue(prevQueue => prevQueue.slice(1));
        setIsPlaying(false);
      };
    }

  };

  const startRecording = async () => {
    try {
      setAudioQueue([])
      setIsPlaying(false);
      mikeStaredOnRef.current = Date.now();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);

      processorRef.current = audioContextRef.current.createScriptProcessor(1024, 1, 1);
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      processorRef.current.onaudioprocess = (e) => {

        const audioData = e.inputBuffer.getChannelData(0);
        const audioDataArray = Array.from(audioData);

        // Check for silence

        const isSound = audioDataArray.some(sample => Math.abs(sample) > SILENCE_THRESHOLD);
        const initRec = audioDataArray.some(sample => Math.abs(sample) > START_THRESHOLD);
        console.log("initRec: ", initRec, "silenceStartRefInit.current: ", silenceStartRefInit.current)
        if (initRec) {
          silenceStartRefInit.current = Date.now();
        }
        if (silenceStartRefInit.current) {
          if (isSound) {
            silenceStartRef.current = Date.now();
          } else {
            if (silenceStartRef.current && (Date.now() - silenceStartRef.current) > SILENCE_DURATION) {
              silenceStartRefInit.current = null
              setIsAutoRecording(false);
              stopRecording();
              setStatus('Auto-recording stopped');
            }
          }
          socket.emit('audio_data', audioDataArray);
        } else {
          if (mikeStaredOnRef.current && (Date.now() - mikeStaredOnRef.current) > 5000) {
            mikeStaredOnRef.current = null
            setIsAutoRecording(false);
            stopRecording();
          }
          console.log('Not started yet');
        }
      };
      setStatus('Listening...');
    } catch (error) {
      console.error('Error starting recording:', error);
      setStatus('Error accessing microphone');
    }
  };


  const stopRecording = () => {
    setAudioQueue([])
    setIsPlaying(false);
    isStarted.current = null;
    silenceStartRef.current = null;
    mikeStaredOnRef.current = null;
    console.log('setting false')
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus('Processing...');
    socket.emit('stop_recording');
    silenceStartRef.current = null;
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    hadSpeechRef.current = false; // Reset speech detection
  };

  const toggleAutoRecording = () => {
    if (!isAutoRecording) {
      setIsAutoRecording(true);
      silenceStartRefInit.current = null;
      startRecording();
    } else {
      setIsAutoRecording(false);
      stopRecording();
      setStatus('Auto-recording stopped');
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
