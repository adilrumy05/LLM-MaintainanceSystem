// src/pages/Dashboard.jsx
import { useState, useEffect, useRef } from 'react';
import QueryInput from '../components/dashboard/QueryInput';
import AgentStatus from '../components/agents/AgentStatus';
import RecommendationReview from '../components/dashboard/RecommendationReview';
import { useRole } from '../hooks/useRole';
import { submitQuery } from '../services/api';

function VoicePulse({ listening }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '16px' }}>
      {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
        <div key={i} style={{
          width: '3px',
          height: listening ? `${h * 4}px` : '3px',
          background: 'white',
          borderRadius: '2px',
          transition: `height 0.2s ease ${i * 0.06}s`,
        }} />
      ))}
    </div>
  );
}

function SimpleProcessingBar() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '12px' }}>
        Analyzing your task…
      </div>
      <div className="progress-track">
        <div className="progress-fill" />
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '10px' }}>
        This may take a few seconds
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [isProcessing, setIsProcessing]     = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [query, setQuery]                   = useState('');
  const [listening, setListening]           = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError]         = useState('');
  const [transcript, setTranscript]         = useState('');
  const [inputValue, setInputValue]         = useState('');
  const recognitionRef                      = useRef(null);

  const {
    role, isAdmin, isExpert, isJunior,
    needsGuidance, canSeeAgents,
  } = useRole();

  const roleColor = {
    admin:        'var(--fedex-purple)',
    expert:       'var(--blue)',
    intermediate: 'var(--green)',
    beginner:     'var(--fedex-orange)',
  }[role];

  const welcomeSubtitle = {
    admin:        'Full system access · Manage users, review all activity and approvals.',
    expert:       'Expert access · Analyze tasks, review agent reasoning and approve procedures.',
    intermediate: 'Intermediate access · Analyze tasks and approve recommendations.',
    beginner:     'Read-only access · Review procedures and escalate to a senior technician.',
  }[role];

  const placeholder = {
    beginner:     "Describe what needs fixing — I'll guide you step by step…",
    intermediate: "Enter a task to retrieve the relevant procedure and tool list…",
    expert:       "Enter a technical query for deep specification and root cause analysis…",
    admin:        "Enter a procedure to review for risk, compliance, and audit flags…",
  }[role] || 'Enter a maintenance task, equipment issue, or disassembly request...';

  useEffect(() => {
    const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setVoiceSupported(supported);
  }, []);

  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate  = 0.95;
    utterance.pitch = 1;
    utterance.lang  = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const saveToHistory = (queryText) => {
    const existing = JSON.parse(localStorage.getItem('queryHistory') || '[]');
    const entry    = { id: Date.now(), text: queryText, timestamp: new Date().toISOString() };
    const updated  = [entry, ...existing].slice(0, 50);
    localStorage.setItem('queryHistory', JSON.stringify(updated));
  };

  const startListening = () => {
    setVoiceError('');
    setTranscript('');
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang            = 'en-US';
    recognition.interimResults  = true;
    recognition.continuous      = false;
    recognition.maxAlternatives = 1;
    recognition.onstart  = () => setListening(true);
    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(final || interim);
      if (final) { setListening(false); handleSubmitQuery(final); }
    };
    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed')    setVoiceError('Microphone access denied.');
      else if (e.error === 'no-speech') setVoiceError('No speech detected. Try again.');
      else setVoiceError(`Voice error: ${e.error}`);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  // const handleSubmitQuery = async (queryText) => {
  //   saveToHistory(queryText);
  //   setQuery(queryText);
  //   setRecommendation(null);
  //   setIsProcessing(true);
  //   await new Promise(r => setTimeout(r, 4000));
  //   const result = {
  //     text: 'Step-by-step disassembly procedure generated.',
  //     sources: [
  //       { title: 'FedEx Manual X-1000',   page: 42, section: '5.2' },
  //       { title: 'OSHA 29 CFR 1910.147',  page: 12, section: '3.1' },
  //     ],
  //     reasoning: 'Retrieved from engine manual; safety validation passed.',
  //   };
  //   setRecommendation(result);
  //   setIsProcessing(false);
  //   speak('Recommendation ready. Please review and approve or reject.');
  // };
  const handleSubmitQuery = async (queryText) => {
    try {
      saveToHistory(queryText);
      setQuery(queryText);
      setRecommendation(null);
      setIsProcessing(true);

      const result = await submitQuery(queryText);
      console.log("Backend result:", result);

      setRecommendation(result);
      speak('Recommendation ready. Please review and approve or reject.');
    } catch (error) {
      console.error('Query failed:', error);
      // alert('Failed to get response from backend.');
      const message =
        error?.response?.data?.details?.error?.message ||
        error?.response?.data?.error ||
        'Failed to get response from backend.';
      alert(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => {
    speak('Recommendation approved and logged to audit trail.');
    alert('✓ Recommendation approved and logged to audit trail.');
    setRecommendation(null);
  };

  const handleReject = () => {
    speak('Recommendation rejected and logged to audit trail.');
    alert('✕ Recommendation rejected and logged to audit trail.');
    setRecommendation(null);
  };

  return (
    <div style={{
      width: '100%', maxWidth: '860px', margin: '0 auto',
      padding: '24px 20px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: '16px',
    }}>

      <style>{`@keyframes wave { from { transform: scaleY(0.5); } to { transform: scaleY(1.5); } }`}</style>

      {/* Header — centered with role-aware subtitle */}
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <div style={{ fontSize: '32px', color: 'var(--fedex-purple)', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>
          Welcome
        </div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
          Maintenance Copilot
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>
          {welcomeSubtitle}
        </div>

        {/* Role badge */}
        <div style={{ marginTop: '10px' }}>
          <span style={{
            fontSize: '10px', fontWeight: '700', fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            border: `1px solid ${roleColor}`, color: roleColor,
            borderRadius: '20px', padding: '3px 12px',
            background: 'rgba(0,0,0,0.03)',
          }}>
            {role} access
          </span>
        </div>
      </div>

      {/* AI Helper identity banner */}
      {(() => {
        const helperMeta = {
          beginner:     { label: 'Guidance Helper',             icon: '💡', color: 'var(--blue)',         bg: 'rgba(41,121,255,0.07)',   border: 'rgba(41,121,255,0.2)'  },
          intermediate: { label: 'Task Assistance Helper',      icon: '🔧', color: 'var(--yellow)',       bg: 'rgba(255,179,0,0.07)',    border: 'rgba(255,179,0,0.25)'  },
          expert:       { label: 'Technical Decision Support',  icon: '⚙️', color: 'var(--blue)',         bg: 'rgba(41,121,255,0.07)',   border: 'rgba(41,121,255,0.2)'  },
          admin:        { label: 'Approval & Oversight Helper', icon: '🛡', color: 'var(--fedex-purple)', bg: 'rgba(172,114,235,0.07)', border: 'rgba(172,114,235,0.2)' },
        }[role];
        if (!helperMeta) return null;
        return (
          <div style={{
            background: helperMeta.bg, border: `1px solid ${helperMeta.border}`,
            borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
            fontSize: '12px', color: helperMeta.color, lineHeight: '1.5',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '15px' }}>{helperMeta.icon}</span>
            <span>
              <strong>{helperMeta.label} active</strong>
              {' · '}Responses are tailored to your access level and grounded in retrieved manual content.
            </span>
          </div>
        );
      })()}

      {/* Beginner safety banner */}
      {isJunior && (
        <div style={{
          background: 'rgba(41,121,255,0.08)', border: '1px solid rgba(41,121,255,0.2)',
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '12px', color: 'var(--blue)', lineHeight: '1.6',
        }}>
          💡 <strong>Getting started:</strong> Describe your task below in plain language.
          The AI will generate a step-by-step procedure. Always consult a senior technician before performing any work.
        </div>
      )}

      {/* Intermediate reminder */}
      {role === 'intermediate' && (
        <div style={{
          background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.25)',
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '12px', color: 'var(--yellow)', lineHeight: '1.6',
        }}>
          ⚠️ <strong>Reminder:</strong> You can approve standard procedures.
          Escalate HIGH difficulty tasks to an Expert Technician.
        </div>
      )}

      {/* Voice status bar */}
      {(listening || transcript || voiceError) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: voiceError ? 'rgba(244,67,54,0.08)' : 'rgba(172,114,235,0.08)',
          border: `1px solid ${voiceError ? 'rgba(244,67,54,0.25)' : 'rgba(172,114,235,0.25)'}`,
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '12px', fontFamily: 'monospace',
        }}>
          {listening && (
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: '3px', background: 'var(--fedex-purple)', borderRadius: '2px',
                  animation: `wave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                  height: `${8 + i * 3}px`,
                }} />
              ))}
            </div>
          )}
          <span style={{ color: voiceError ? 'var(--red)' : 'var(--fedex-purple)', fontWeight: '700' }}>
            {voiceError ? voiceError : listening ? 'Listening… speak your task' : `Heard: "${transcript}"`}
          </span>
          {!listening && (
            <button onClick={() => { setTranscript(''); setVoiceError(''); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>✕
            </button>
          )}
        </div>
      )}

      {/* Active task badge */}
      {(isProcessing || recommendation) && query && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '12px', color: 'var(--text-secondary)',
        }}>
          <span style={{ fontSize: '14px' }}>📋</span>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Active task:</strong>{' '}
            {query.slice(0, 80)}{query.length > 80 ? '…' : ''}
          </span>
          <span className="badge badge-red" style={{ marginLeft: 'auto' }}>HIGH</span>
        </div>
      )}

      {/* Query card */}
      <div className="query-card">
        <div className="card-label">Task Description</div>
        <textarea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
              e.preventDefault();
              handleSubmitQuery(inputValue);
              setInputValue('');
            }
          }}
          placeholder={placeholder}
          className="query-textarea"
          rows="3"
          disabled={isProcessing}
        />

        {/* Side-by-side buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button
            onClick={() => { if (inputValue.trim()) { handleSubmitQuery(inputValue); setInputValue(''); } }}
            disabled={isProcessing || !inputValue.trim()}
            className="button button-primary"
            style={{ flex: 1 }}
          >
            {isProcessing ? '⟳  Processing…' : '⚡  Analyze Task'}
          </button>

          {voiceSupported && (
            <button
              onClick={listening ? stopListening : startListening}
              disabled={isProcessing}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '11px 20px', borderRadius: '8px',
                border: '1px solid rgba(172,114,235,0.4)',
                background: listening ? 'var(--red)' : 'rgba(172,114,235,0.10)',
                color: listening ? 'white' : 'var(--fedex-purple)',
                fontSize: '13px', fontWeight: '700',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.5 : 1,
                transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <VoicePulse listening={listening} />
              {listening ? 'Stop' : '🎤 Voice'}
            </button>
          )}
        </div>
      </div>

      {/* Agent pipeline — admin/expert see full, others see simple bar */}
      {isProcessing && (canSeeAgents ? <AgentStatus /> : <SimpleProcessingBar />)}

      {recommendation && (
        <RecommendationReview
          recommendation={recommendation}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Empty state — role aware */}
      {!isProcessing && !recommendation && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--text-muted)', fontSize: '12px',
          border: '1px dashed var(--border)', borderRadius: '10px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚡</div>
          <div style={{ fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            No active task
          </div>
          <div>
            {isJunior
              ? 'Describe what needs fixing above — the AI will guide you through it.'
              : 'Describe a maintenance task above or use Voice Mode to activate the AI pipeline.'}
          </div>
        </div>
      )}
    </div>
  );
}