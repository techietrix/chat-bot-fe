// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');


const SILENCE_THRESHOLD = 0.05;
const SILENCE_THRESHOLD1 = 0.1;
const SILENCE_DURATION = 2000; // 2 seconds

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [status, setStatus] = useState('Click the button to start recording');
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState('');
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const silenceStartRef = useRef(null);
  const silenceStartRefInit = useRef(Date.now());
  const isStarted = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const hadSpeechRef = useRef(false); // Track if speech was detected

  useEffect(() => {
    socket.on('stop_mike', () => {
      stopMike()
    });
    socket.on('receive_audio', (data) => {
      setTranscription(data.transcription);
      setResponse(data.response);
      stopRecording();
      const audio = new Audio(data.audioUrl);
      audio.play();
      setStatus('Playing response...');
      audio.onended = () => {
        setStatus('Listening...');
        if (isAutoRecording) {
          silenceStartRefInit.current = Date.now();
          startRecording();
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

  const startRecording = async () => {
    try {
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
        const isFirstWordFound = audioDataArray.some(sample => Math.abs(sample) > SILENCE_THRESHOLD1);
        const isSound = audioDataArray.some(sample => Math.abs(sample) > SILENCE_THRESHOLD);

        if (isFirstWordFound && !isStarted.current) {
          console.log('setting true 85')
          isStarted.current = true;
        }

        //if mike started and first word not detected yet, then stop mike after 5 seconds
        if (!isStarted.current) {
          if (Date.now() - silenceStartRefInit.current >= 5000) {
            stopMike();
          }
        }



        //once recording started, and found 2 seconds of silence then emmit stop_recording.
        if (!isSound) {
          if (hadSpeechRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION) {
              if (!silenceTimeoutRef.current) {
                silenceTimeoutRef.current = setTimeout(() => {
                  stopRecording();
                }, 100);
                // Small delay to ensure we catch the last bit of audio
              }
            }
          }
        }

        if (isStarted.current) {
          hadSpeechRef.current = true;
          console.log('setting true 105')
          silenceStartRef.current = null;

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          socket.emit('audio_data', audioDataArray);
        }
      };

      setIsRecording(true);
      setStatus('Listening...');
    } catch (error) {
      console.error('Error starting recording:', error);
      setStatus('Error accessing microphone');
    }
  };



  const stopMike = () => {
    isStarted.current = null;
    console.log('setting false')
    console.log('called to stop recording')
    setIsAutoRecording(false);
    console.log(isRecording)
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
    setIsRecording(false);
    setStatus('');
    silenceStartRef.current = null;
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    hadSpeechRef.current = false; // Reset speech detection
  };

  const stopRecording = () => {
    isStarted.current = null;
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
    setIsRecording(false);
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
      silenceStartRefInit.current = Date.now();
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
