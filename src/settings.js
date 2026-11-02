// src/settings.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { StatusEditor } from './feed.js';
import { disablePush, enablePush, pushSupported } from './push.js';
import { ConfirmDialog } from './ui.js';
import { getDominantColor } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const SettingsView = ({ darkMode, toggleDarkMode, onLogout }) => {
      const auth = useAuth();
      const ui = useUI();
      const toast = useToast();
      const [bgUrl, setBgUrl] = useState(auth.user.background_url || '');
      const [bgMode, setBgMode] = useState(auth.user.background_mode || 'cover');
      const [bgBlur, setBgBlur] = useState(auth.user.background_blur != null ? auth.user.background_blur : 10);
      const [pushOn, setPushOn] = useState(false);
      const [pushBusy, setPushBusy] = useState(false);
      const bgRef = useRef(null);
      const blurTimer = useRef(null);

      useEffect(() => {
        let alive = true;
        (async () => {
          if (!pushSupported() || Notification.permission !== 'granted') return;
          try {
            const st = await api.getPushStatus();
            if (alive) setPushOn((st.subscriptions || 0) > 0);
          } catch (e) { /* ignore */ }
        })();
        return () => { alive = false; };
      }, []);

      const togglePush = async () => {
        if (pushBusy) return;
        setPushBusy(true);
        try {
          if (pushOn) {
            await disablePush();
            setPushOn(false);
            toast.show('Push notifications disabled.');
          } else {
            const r = await enablePush();
            if (r.ok) {
              setPushOn(true);
              toast.show('Push notifications enabled.');
            } else if (r.reason === 'denied') {
              toast.error('Notifications are blocked in your browser settings.');
            } else if (r.reason === 'unsupported') {
              toast.error('This browser does not support push notifications.');
            } else {
              toast.error('Could not enable push notifications.');
            }
          }
        } catch (e) { toast.error(e.message); }
        setPushBusy(false);
      };

      const sendTest = async () => {
        try { await api.sendTestPush(); toast.show('Test push sent!'); }
        catch (e) { toast.error(e.message); }
      };

      const applyBackground = (url, mode, blur) => {
        const blurPx = (blur != null ? blur : 10);
        document.body.style.backgroundImage = '';
        document.documentElement.style.setProperty('--bg-blur', `${blurPx}px`);
        if (url) {
          document.documentElement.style.setProperty('--body-bg-image', `url(${url})`);
          if (mode === 'tile') {
            document.body.classList.add('bg-tile');
          } else {
            document.body.classList.remove('bg-tile');
          }
          getDominantColor(url, (color) => document.documentElement.style.setProperty('--gplus-red', color));
        } else {
          const DEFAULT_BG = darkMode
            ? 'https://cinemint.online/mylo/background.webp'
            : 'https://cinemint.online/mylo/background-lite.webp';
          document.documentElement.style.setProperty('--body-bg-image', `url(${DEFAULT_BG})`);
          document.body.classList.remove('bg-tile');
          document.documentElement.style.setProperty('--gplus-red', '#1BA1E2');
        }
      };

      useEffect(() => {
        if (auth.user) applyBackground(auth.user.background_url, auth.user.background_mode || 'cover', auth.user.background_blur != null ? auth.user.background_blur : 10);
      }, [darkMode, auth.user]);

      const uploadBg = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        try {
          const res = await api.uploadBackground(fd);
          setBgUrl(res.url);
          auth.setUser({ ...auth.user, background_url: res.url });
          applyBackground(res.url, bgMode, bgBlur);
          toast.show('Background updated.');
        } catch (err) { toast.error(err.message); }
        if (bgRef.current) bgRef.current.value = '';
      };
      const removeBg = async () => {
        try {
          await api.deleteBackground();
          setBgUrl('');
          auth.setUser({ ...auth.user, background_url: null });
          applyBackground('', bgMode, bgBlur);
          toast.show('Background removed.');
        } catch (err) { toast.error(err.message); }
      };
      const changeMode = async (mode) => {
        setBgMode(mode);
        try { await api.setBackgroundMode(mode); auth.setUser({ ...auth.user, background_mode: mode }); applyBackground(bgUrl, mode, bgBlur); }
        catch (err) { toast.error(err.message); }
      };
      const changeBlur = (blur) => {
        setBgBlur(blur);
        applyBackground(bgUrl, bgMode, blur);
        if (blurTimer.current) clearTimeout(blurTimer.current);
        blurTimer.current = setTimeout(async () => {
          try { await api.setBackgroundBlur(blur); auth.setUser({ ...auth.user, background_blur: blur }); }
          catch (err) { toast.error(err.message); }
        }, 350);
      };

      // NOTE: onSaved is intentionally omitted — StatusEditor already applies
      // the new status optimistically via auth.setUser, and SettingsView
      // renders it straight from context. (This previously referenced an
      // undefined `load`, crashing the app when the modal opened.)
      const editStatus = () => ui.openModal({ title: 'Set status', render: (c) => <StatusEditor onClose={c} /> });

      const confirmDelete = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Delete account?" message="This permanently tombstones your account and frees your email and handle. This cannot be undone."
            confirmLabel="Delete forever" danger onClose={close}
            onConfirm={async () => { try { await api.deleteAccount(); close(); onLogout(); } catch (e) { toast.error(e.message); } }} />
        )
      });
      const confirmLogout = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Log out?" message="You'll need to sign in again." confirmLabel="Log out" onClose={close}
            onConfirm={async () => { close(); onLogout(); }} />
        )
      });

      return (
        <div className="feed-container metro-stagger">
          <div className="list-header"><h2>Settings</h2></div>

          <div className="card">
            <div className="card-section-title">Appearance</div>
            <div className="settings-row">
              <span>Dark mode</span>
              <label className="toggle-switch"><input type="checkbox" checked={darkMode} onChange={toggleDarkMode} /><span className="slider"></span></label>
            </div>
            <div className="settings-row">
              <div><div>Background image</div><div className="user-handle">Sets a custom background &amp; accent color</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => bgRef.current.click()}>Upload</button>
                {bgUrl && <button className="btn btn-outline btn-sm" onClick={removeBg}>Remove</button>}
                <input type="file" ref={bgRef} accept="image/*" style={{ display: 'none' }} onChange={uploadBg} />
              </div>
            </div>
            {bgUrl && (
              <div className="settings-row">
                <span>Background mode</span>
                <select className="form-input" style={{ width: 'auto' }} value={bgMode} onChange={e => changeMode(e.target.value)}>
                  <option value="cover">Cover</option>
                  <option value="tile">Tile</option>
                </select>
              </div>
            )}
            {bgUrl && bgMode !== 'tile' && (
              <div className="settings-row" style={{ alignItems: 'center' }}>
                <div><div>Background blur</div><div className="user-handle">Soften the wallpaper behind the app</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="40" value={bgBlur} onChange={e => changeBlur(Number(e.target.value))} style={{ width: 140 }} />
                  <span className="user-handle" style={{ minWidth: 28 }}>{bgBlur}px</span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-section-title">Notifications</div>
            <div className="settings-row">
              <div><div>Push notifications</div><div className="user-handle">Alerts for mentions, replies, comments, and messages</div></div>
              <button className="btn btn-outline btn-sm" disabled={pushBusy} onClick={togglePush}>{pushBusy ? '…' : (pushOn ? 'Disable' : 'Enable')}</button>
            </div>
            {pushOn && (
              <div className="settings-row">
                <span>Test it</span>
                <button className="btn btn-outline btn-sm" onClick={sendTest}>Send test push</button>
              </div>
            )}
            {pushSupported() && Notification.permission === 'denied' && (
              <div className="settings-row"><span className="user-handle">Blocked — allow notifications for this site in your browser settings.</span></div>
            )}
          </div>

          <div className="card">
            <div className="card-section-title">Status</div>
            <div className="settings-row">
              <span>{auth.user.status_emoji || ''} {auth.user.status_text || 'No status set'}</span>
              <button className="btn btn-outline btn-sm" onClick={editStatus}>Edit</button>
            </div>
          </div>

          <div className="card">
            <div className="card-section-title">Account</div>
            <div className="settings-row">
              <span>Log out</span>
              <button className="btn btn-outline btn-sm" onClick={confirmLogout}>Log out</button>
            </div>
            <div className="settings-row">
              <div><div style={{ color: 'var(--gplus-red)' }}>Delete account</div><div className="user-handle">Permanently remove your account</div></div>
              <button className="btn btn-sm" style={{ background: '#b00020' }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      );
    };

export { SettingsView };
