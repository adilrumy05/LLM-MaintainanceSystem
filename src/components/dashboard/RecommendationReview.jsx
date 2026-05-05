// RecommendationReview.jsx

// src/components/dashboard/RecommendationReview.jsx
import { useState } from 'react';
import { useRole } from '../../hooks/useRole';

// const STEPS = [
//   {
//     title: 'Power-down & Lockout/Tagout',
//     desc: 'Isolate Unit #403 from power. Apply LOTO tags per OSHA 29 CFR 1910.147.',
//     simplDesc: 'Turn off and lock out the machine so it cannot start. Put a tag on it.',
//     tag: 'CRITICAL SAFETY', tagClass: 'badge-red', difficulty: 'high',
//   },
//   {
//     title: 'Positioning & Support',
//     desc: 'Position maintenance platform. Secure engine on support cradle.',
//     simplDesc: 'Set up the work platform and make sure the engine is held steady.',
//     tag: 'STANDARD', tagClass: 'badge-gray', difficulty: 'low',
//   },
//   {
//     title: 'Panel Fastener Removal',
//     desc: 'Remove 12× M8 hex bolts (torque: 25 Nm). Store in labelled tray.',
//     simplDesc: 'Remove the 12 bolts holding the panel. Keep them in a labelled tray so nothing gets lost.',
//     tag: null, tagClass: null, difficulty: 'medium',
//   },
//   {
//     title: 'Cover Lift-off & Inspection',
//     desc: 'Lift cover with 2-person assist. Inspect seals and gaskets for wear.',
//     simplDesc: 'Lift the cover with another person helping. Look for any damaged seals.',
//     tag: null, tagClass: null, difficulty: 'medium',
//   },
// ];

// const DIFFICULTY_BADGE = {
//   high:   { label: 'High difficulty',   cls: 'badge-red'    },
//   medium: { label: 'Medium difficulty', cls: 'badge-yellow' },
//   low:    { label: 'Low difficulty',    cls: 'badge-green'  },
// };

export default function RecommendationReview({ recommendation, onApprove, onReject }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const { role, isAdmin, isExpert, isJunior, needsGuidance, canApprove, canSeeReasoning, canSeeAgents } = useRole();

  const roleColor = {
    admin:        'var(--fedex-purple)',
    expert:       'var(--blue)',
    intermediate: 'var(--green)',
    beginner:     'var(--fedex-orange)',
  }[role];

  return (
    <div className="card">

      {/* Role indicator pill */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <span style={{
          fontSize: '10px', fontWeight: '700', fontFamily: 'monospace',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          background: `rgba(0,0,0,0.04)`, border: `1px solid ${roleColor}`,
          color: roleColor, borderRadius: '20px', padding: '3px 10px',
        }}>
          {role} view
        </span>
      </div>

      {/* AI badge */}
      <div className="ai-badge">
        <span style={{ fontSize: '16px' }}>🤖</span>
        {{
          beginner:     'Guidance Helper · Plain-language procedure — review every step before touching anything',
          intermediate: 'Task Assistance Helper · Procedure from manual — verify tool list before starting',
          expert:       'Technical Decision Support · Deep analysis from source documents — validate specs before proceeding',
          admin:        'Approval & Oversight Helper · Risk and compliance summary — human sign-off required',
        }[role] || 'AI recommendation generated · Review all steps before deciding'}
      </div>

      {/* Beginner guidance banner */}
      {isJunior && (
        <div style={{
          background: 'rgba(41,121,255,0.08)', border: '1px solid rgba(41,121,255,0.2)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '14px',
          fontSize: '12px', color: 'var(--blue)', lineHeight: '1.6',
        }}>
          💡 <strong>Beginner tip:</strong> Read every step carefully before touching anything.
          If you are unsure at any point, stop and contact a senior technician.
        </div>
      )}

      {/* Intermediate guidance banner */}
      {role === 'intermediate' && (
        <div style={{
          background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.25)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '14px',
          fontSize: '12px', color: 'var(--yellow)', lineHeight: '1.6',
        }}>
          ⚠️ <strong>Safety reminder:</strong> Verify LOTO is applied before proceeding.
          Consult an Expert Technician for any HIGH difficulty steps.
        </div>
      )}

      {/* Steps */}
      <div className="card-label">Generated Procedure</div>
      
      {/* {STEPS.map((step, i) => (
        <div key={i} className="step-item">
          <div className="step-num">{i + 1}</div>
          <div className="step-content">
            <div className="step-title">{step.title}</div>
            <div className="step-desc">
              {isJunior ? step.simplDesc : step.desc}
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '5px' }}>

              {step.tag && (
                <span className={`badge ${step.tagClass}`} style={{ display: 'inline-flex' }}>
                  {step.tagClass === 'badge-red' ? '⚠ ' : ''}{step.tag}
                </span>
              )}

              {needsGuidance && (
                <span className={`badge ${DIFFICULTY_BADGE[step.difficulty].cls}`} style={{ display: 'inline-flex' }}>
                  {DIFFICULTY_BADGE[step.difficulty].label}
                </span>
              )}
            </div>
          </div>
        </div>
      ))} */}
      
      <div style={{ marginBottom: '16px' }}>
        {(recommendation.text || '')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .map((line, i) => {
            const cleanLine = line.replace(/\*\*/g, '');

            const isHeading =
              cleanLine.endsWith(':') ||
              cleanLine.startsWith('Task:') ||
              cleanLine.startsWith('Safety First') ||
              cleanLine.startsWith('Preparation') ||
              cleanLine.startsWith('The Inspection Process') ||
              cleanLine.startsWith('Documentation and Next Steps');

            const isBullet =
              cleanLine.startsWith('*') ||
              cleanLine.startsWith('-') ||
              /^\d+\./.test(cleanLine);

            return (
              <div
                key={i}
                style={{
                  marginBottom: '10px',
                  paddingLeft: isBullet ? '10px' : '0',
                  borderLeft: isBullet ? '2px solid rgba(172,114,235,0.25)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: isHeading ? '13px' : '12px',
                    fontWeight: isHeading ? '700' : '400',
                    color: isHeading ? 'var(--text-primary)' : 'var(--text-secondary)',
                    lineHeight: '1.7',
                  }}
                >
                  {cleanLine}
                </div>
              </div>
            );
          })}
      </div>

      <div className="section-divider" />

      
      {/* Sources — all roles */}
      <div className="card-label">📎 Source Citations</div>
      {recommendation.sources.map((src, i) => (
        <div key={i} className="citation-card">
          <div className="citation-source">{src.title}</div>
          <div className="citation-detail">Page {src.page}, Section {src.section}</div>
          <span className="citation-link">View Source Document →</span>
        </div>
      ))}

      {/* Reasoning — admin and expert only */}
      {canSeeReasoning && (
        <>
          <div className="section-divider" />
          <div className="flex-between" style={{ marginBottom: '10px' }}>
            <div className="card-label" style={{ marginBottom: 0 }}>Agent Reasoning Path</div>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              style={{ fontSize: '10px', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
            >
              {showReasoning ? 'Collapse ↑' : 'Expand ↓'}
            </button>
          </div>
          {showReasoning && (
            <div className="reasoning-box" style={{ marginBottom: '14px' }}>
              {[
                ['📚', 'Data Retrieval Agent',       'Found procedure 5.2 · 3 relevant documents'],
                ['🛡',  'Safety Validation Agent',    'LOTO required · OSHA compliant · Verified'],
                ['📊', 'Priority Adjustment Agent',  'Task classified HIGH · Overdue 2 days'],
              ].map(([icon, name, detail]) => (
                <div key={name} className="reasoning-item">
                  <span className="reasoning-icon">{icon}</span>
                  <div className="reasoning-text">
                    <strong style={{ color: 'var(--text-primary)' }}>{name}:</strong> {detail}
                  </div>
                  <span className="reasoning-check">✓ Verified</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-divider" />

      {/* HITL Buttons — admin, expert, intermediate can approve */}
      {canApprove ? (
        <>
          <div className="card-label">⚖ Human-in-the-Loop Decision</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={onApprove} className="button button-success">
              ✓ &nbsp;Approve &amp; Log
            </button>
            {/* Revision request — admin and expert only */}
            {(isAdmin || isExpert) && (
              <button className="button button-warning">
                ✏ &nbsp;Request Revision
              </button>
            )}
            <button onClick={onReject} className="button button-danger">
              ✕ &nbsp;Override / Reject
            </button>
          </div>
          <div className="audit-notice">
            🔒 This action will be recorded in the audit trail
          </div>
        </>
      ) : (
        /* Beginner — read only, no approve/reject */
        <div style={{
          textAlign: 'center', padding: '16px',
          background: 'var(--bg-elevated)', borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔒</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Approval not available at your access level
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Share this recommendation with an Intermediate Technician or above to approve.
          </div>
        </div>
      )}
    </div>
  );
}