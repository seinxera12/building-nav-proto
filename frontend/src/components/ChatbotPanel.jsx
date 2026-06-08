// components/ChatbotPanel.jsx — sliding bottom-sheet chatbot panel
import { useState, useRef, useEffect, useCallback } from 'react';
import useNavStore from '../store/useNavStore';

const LANGUAGES = [
  { code: null, label: 'Auto' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
];

export default function ChatbotPanel() {
  const isOpen        = useNavStore(s => s.chatbot.isOpen);
  const messages      = useNavStore(s => s.chatbot.messages);
  const isProcessing  = useNavStore(s => s.chatbot.isProcessing);
  const isAvailable   = useNavStore(s => s.chatbot.isAvailable);
  const isListening   = useNavStore(s => s.chatbot.isListening);
  const selectedLang  = useNavStore(s => s.chatbot.selectedLanguage);
  const candidates    = useNavStore(s => s.chatbot.candidates);
  const needsConfirm  = useNavStore(s => s.chatbot.needsConfirmation);

  const toggleChat     = useNavStore(s => s.toggleChat);
  const selectLanguage = useNavStore(s => s.selectLanguage);
  const sendChatQuery  = useNavStore(s => s.sendChatQuery);
  const selectDest     = useNavStore(s => s.selectDestination);

  const [inputText, setInputText] = useState('');
  const [langOpen, setLangOpen]   = useState(false);
  const scrollRef = useRef(null);
  const mediaRef  = useRef(null);
  const chunksRef = useRef([]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || isProcessing) return;
    setInputText('');
    sendChatQuery(trimmed, null);
  }, [inputText, isProcessing, sendChatQuery]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceStart = useCallback(async () => {
    if (isProcessing || !isAvailable) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        );
        useNavStore.setState(s => ({ chatbot: { ...s.chatbot, isListening: false } }));
        sendChatQuery(null, b64);
      };
      mediaRef.current = recorder;
      recorder.start();
      useNavStore.setState(s => ({ chatbot: { ...s.chatbot, isListening: true } }));
    } catch {
      // Microphone access denied — fall back silently
    }
  }, [isProcessing, isAvailable, sendChatQuery]);

  const handleVoiceStop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      mediaRef.current.stop();
    }
  }, []);

  const handleConfirm = useCallback((nodeId) => {
    useNavStore.setState(s => ({
      chatbot: { ...s.chatbot, candidates: [], needsConfirmation: false },
    }));
    toggleChat(false);
    selectDest(nodeId);
  }, [selectDest, toggleChat]);

  const langLabel = LANGUAGES.find(l => l.code === selectedLang)?.label || 'Auto';

  if (!isOpen) return null;

  return (
    <div className="chatbot-panel" id="chatbot-panel">
      {/* ── Header ──────────────────────────────── */}
      <div className="chatbot-panel__header">
        <div className="chatbot-panel__title-row">
          <span className="chatbot-panel__title">🤖 Navigation Assistant</span>
          <div className="chatbot-panel__lang-wrap">
            <button
              className="chatbot-panel__lang-btn"
              onClick={() => setLangOpen(!langOpen)}
              aria-label="Select language"
            >
              🌐 {langLabel}
            </button>
            {langOpen && (
              <ul className="chatbot-panel__lang-menu">
                {LANGUAGES.map(l => (
                  <li
                    key={l.code ?? 'auto'}
                    className={`chatbot-panel__lang-item${l.code === selectedLang ? ' chatbot-panel__lang-item--active' : ''}`}
                    onClick={() => { selectLanguage(l.code); setLangOpen(false); }}
                  >
                    {l.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          className="btn btn--ghost chatbot-panel__close"
          onClick={() => toggleChat(false)}
          aria-label="Close chatbot"
        >
          ✕
        </button>
      </div>

      {/* ── Degradation banner ──────────────────── */}
      {!isAvailable && (
        <div className="chatbot-panel__banner" role="alert">
          ⚠️ Voice assistant offline — use text search or browse by category.
        </div>
      )}

      {/* ── Message stream ─────────────────────── */}
      <div className="chatbot-panel__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chatbot-panel__empty">
            Ask me where you'd like to go, or say<br />"I need accessible routes."
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${msg.role}`}>
            <p className="chat-bubble__text">{msg.text}</p>
          </div>
        ))}
        {isProcessing && (
          <div className="chat-bubble chat-bubble--assistant chat-bubble--loading">
            <span className="chat-bubble__dots">
              <span /><span /><span />
            </span>
          </div>
        )}

        {/* ── Candidate confirmation ─────────── */}
        {needsConfirm && candidates.length > 0 && (
          <div className="chatbot-panel__candidates">
            <p className="chatbot-panel__candidates-title">Did you mean one of these?</p>
            {candidates.map((c, i) => (
              <button
                key={c.node_id || i}
                className="chatbot-panel__candidate-btn"
                onClick={() => handleConfirm(c.node_id)}
              >
                <span className="chatbot-panel__candidate-name">{c.name}</span>
                {c.category && <span className="chatbot-panel__candidate-cat">{c.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────── */}
      <div className="chatbot-panel__input-bar">
        <button
          className={`chatbot-panel__mic-btn${isListening ? ' chatbot-panel__mic-btn--active' : ''}`}
          onPointerDown={handleVoiceStart}
          onPointerUp={handleVoiceStop}
          onPointerLeave={handleVoiceStop}
          disabled={!isAvailable || isProcessing}
          aria-label={isListening ? 'Release to send' : 'Hold to speak'}
        >
          {isListening ? '🔴' : '🎤'}
        </button>
        <input
          type="text"
          className="chatbot-panel__text-input"
          placeholder={isAvailable ? 'Ask where to go…' : 'Type to search manually…'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          id="chatbot-text-input"
        />
        <button
          className="chatbot-panel__send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || isProcessing}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
