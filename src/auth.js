// src/auth.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    /* ============================ AUTH ============================ */
    const AuthScreen = ({ initialResetToken, onAuthed }) => {
      const [mode, setMode] = useState(initialResetToken ? 'reset' : 'login'); // login | register | forgot | reset
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [handle, setHandle] = useState('');
      const [fullname, setFullname] = useState('');
      const [token, setToken] = useState(initialResetToken || '');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [info, setInfo] = useState('');

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setError(''); setInfo('');
        try {
          if (mode === 'login') {
            const res = await api.login(email, password);
            onAuthed(res.user);
          } else if (mode === 'register') {
            await api.register({ email, password, handle, fullname });
            const res = await api.login(email, password);
            onAuthed(res.user);
          } else if (mode === 'forgot') {
            const res = await api.forgotPassword(email);
            setInfo((res && res.message) || 'If an account exists, a reset link has been sent.');
          } else if (mode === 'reset') {
            await api.resetPassword(token, password);
            setInfo('Password reset. You can sign in now.');
            setMode('login'); setPassword('');
          }
        } catch (err) { setError(err.message); }
        setLoading(false);
      };

      const titles = { login: 'Sign in', register: 'Create account', forgot: 'Reset password', reset: 'Set a new password' };

      return (
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-title">
              <div className="logo" style={{ justifyContent: 'center', marginBottom: 8 }}>
                <img src="https://cinemint.online/mylo/mylogo.png" alt="Mylo" />
              </div>
            </div>

            {error && <div className="auth-msg error">{error}</div>}
            {info && <div className="auth-msg info">{info}</div>}

            <form onSubmit={submit}>
              {mode === 'register' && (
                <>
                  <div className="form-group"><input className="form-input" placeholder="Full name" value={fullname} onChange={e => setFullname(e.target.value)} required /></div>
                  <div className="form-group"><input className="form-input" placeholder="Username (handle)" value={handle} onChange={e => setHandle(e.target.value)} required /></div>
                </>
              )}
              {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                <div className="form-group"><input className="form-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              )}
              {mode === 'reset' && (
                <div className="form-group"><input className="form-input" placeholder="Reset token" value={token} onChange={e => setToken(e.target.value)} required /></div>
              )}
              {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                <div className="form-group"><input className="form-input" type="password" placeholder={mode === 'reset' ? 'New password' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} required /></div>
              )}
              <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Please wait…' : titles[mode]}
              </button>
            </form>

            <div className="auth-links">
              {mode === 'login' && <>
                <button className="link-btn" onClick={() => { setMode('register'); setError(''); setInfo(''); }}>Create account</button>
                <button className="link-btn" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>Forgot password?</button>
              </>}
              {mode === 'register' && <button className="link-btn" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Have an account? Sign in</button>}
              {(mode === 'forgot' || mode === 'reset') && <button className="link-btn" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Back to sign in</button>}
              {mode === 'forgot' && <button className="link-btn" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}>I have a reset token</button>}
            </div>
          </div>
        </div>
      );
    };

export { AuthScreen };
