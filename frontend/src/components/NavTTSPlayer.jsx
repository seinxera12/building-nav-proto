// components/NavTTSPlayer.jsx — non-rendering TTS playback manager
import { useEffect, useRef } from 'react';
import useNavStore from '../store/useNavStore';

const BASE = '';

/**
 * Fetches TTS audio from the backend and plays it.
 * Falls back to browser speechSynthesis if server is unavailable.
 */
async function speakText(text, language, audioRef, abortRef) {
  if (!text) return;

  try {
    const controller = new AbortController();
    abortRef.current = controller;

    const resp = await fetch(`${BASE}/tts/instruction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: language || 'en' }),
      signal: controller.signal,
    });

    if (resp.status === 406) {
      // Korean or unsupported language — fall back to browser TTS
      fallbackSpeak(text, language);
      return;
    }

    if (!resp.ok) {
      fallbackSpeak(text, language);
      return;
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });

    URL.revokeObjectURL(url);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    // If server TTS fails, fall back to browser
    fallbackSpeak(text, language);
  }
}

function fallbackSpeak(text, language) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language || 'en';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function cancelAudio(audioRef, abortRef) {
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export default function NavTTSPlayer() {
  const status       = useNavStore(s => s.status);
  const currentStep  = useNavStore(s => s.currentStep);
  const route        = useNavStore(s => s.route);
  const currentNode  = useNavStore(s => s.currentNode);
  const destNode     = useNavStore(s => s.destinationNode);
  const floor        = useNavStore(s => s.floor);
  const chatbot      = useNavStore(s => s.chatbot);

  const audioRef  = useRef(null);
  const abortRef  = useRef(null);
  const prevStatus = useRef(status);
  const prevStep   = useRef(currentStep);

  const language = chatbot.selectedLanguage || chatbot.detectedLanguage || 'en';
  const isAvailable = chatbot.isAvailable;

  // Status-change announcements
  useEffect(() => {
    if (!isAvailable) return;
    const prev = prevStatus.current;
    prevStatus.current = status;

    if (prev === 'UNLOCATED' && status === 'ANCHORED' && currentNode) {
      cancelAudio(audioRef, abortRef);
      speakText(`You are located at ${currentNode.label}`, language, audioRef, abortRef);
    }

    if (status === 'REROUTING') {
      cancelAudio(audioRef, abortRef);
      speakText('ルートを再計算中', language, audioRef, abortRef);
    }

    if (status === 'ARRIVED') {
      cancelAudio(audioRef, abortRef);
      const destPoi = floor?.pois?.find(p => p.node_id === destNode?.id);
      const label = destPoi?.name || destNode?.label || 'your destination';
      speakText(`You have arrived at ${label}`, language, audioRef, abortRef);
    }
  }, [status, currentNode, destNode, floor, language, isAvailable]);

  // Step-change announcements during navigation
  useEffect(() => {
    if (!isAvailable) return;
    const prev = prevStep.current;
    prevStep.current = currentStep;

    if (status !== 'NAVIGATING' || !route) return;
    if (currentStep === prev) return;

    const inst = route.instructions?.[currentStep];
    if (inst?.text) {
      cancelAudio(audioRef, abortRef);
      speakText(inst.text, language, audioRef, abortRef);
    }
  }, [currentStep, status, route, language, isAvailable]);

  // Clean up on unmount
  useEffect(() => {
    return () => cancelAudio(audioRef, abortRef);
  }, []);

  return null;
}
