// QueryInput.jsx
import { useState } from 'react';

export default function QueryInput({ onSubmit, disabled }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query);
      setQuery('');
    }
  };

  return (
    <div className="query-card">
      <div className="card-label">Task Description</div>
      <form onSubmit={handleSubmit}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a maintenance task, equipment issue, or disassembly request…"
          className="query-textarea"
          rows="3"
          disabled={disabled}
        />
        <div style={{ marginTop: '12px' }}>
          <button
            type="submit"
            disabled={disabled || !query.trim()}
            className="button button-primary"
          >
            {disabled ? '⟳  Processing…' : '⚡  Analyze Task'}
          </button>
        </div>
      </form>
    </div>
  );
}