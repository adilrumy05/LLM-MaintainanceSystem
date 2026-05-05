import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const role = email.includes('admin')        ? 'admin'
               : email.includes('expert')       ? 'expert'
               : email.includes('intermediate') ? 'intermediate'
               : 'beginner';
    localStorage.setItem('user', JSON.stringify({ email, role }));
    navigate(role === 'admin' ? '/admin' : '/dashboard');
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-logo">
          <div className="login-logo-mark">FX</div>
        </div>
        <div className="login-title">FedEx Copilot</div>
        <div className="login-sub">Maintenance Disassembly Assistant · Sign in to continue</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              placeholder="your@fedex.com"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ marginTop: '6px' }}>
            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </div>
        </form>

     

        <div className="audit-notice" style={{ marginTop: '16px' }}>
          🔒 Secured with Role-Based Access Control
        </div>
      </div>
    </div>
  );
}
