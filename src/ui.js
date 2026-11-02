// src/ui.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useToast } from './contexts.js';
import { I } from './icons.js';
import { fallbackAvatar, formatText } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏', '🙏', '💯', '😍', '🤔', '✅', '👀', '🚀', '💀'];
    const Avatar = ({ user, size = 40, onClick, className = 'avatar' }) => {
      const u = user || {};
      return (
        <img
          src={u.photo_url || u.user_photo || fallbackAvatar(u)}
          className={className}
          style={{ width: size, height: size, cursor: onClick ? 'pointer' : 'default' }}
          onClick={onClick}
          alt={u.name || u.handle || 'User'}
          onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(u); }}
        />
      );
    };

    const Spinner = () => <div className="spinner"></div>;

    const Modal = ({ title, children, onClose, wide }) => (
      <div className="modal-overlay" onClick={onClose}>
        <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={e => e.stopPropagation()}>
          {title && (
            <div className="modal-header">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={onClose}><I.Close /></button>
            </div>
          )}
          <div className="modal-body">{children}</div>
        </div>
      </div>
    );

    const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) => {
      const [busy, setBusy] = useState(false);
      return (
        <div>
          {title && (
            <h3 style={{ fontWeight: 'normal', textTransform: 'lowercase', fontSize: 28, marginBottom: 16 }}>
              {title}
            </h3>
          )}
          <p style={{ marginBottom: 20 }}>{message}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              className={`btn ${danger ? 'btn-danger' : ''}`}
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (e) { setBusy(false); } }}
            >{busy ? 'Working…' : confirmLabel}</button>
          </div>
        </div>
      );
    };

    const EmojiPicker = ({ onPick }) => (
      <div className="emoji-bar">
        {EMOJIS.map(e => <button key={e} onClick={() => onPick(e)}>{e}</button>)}
      </div>
    );

    const GifPicker = ({ onPick, onClose }) => {
      const toast = useToast();
      const [q, setQ] = useState('');
      const [results, setResults] = useState([]);
      const [loading, setLoading] = useState(true);

      const load = useCallback(async (query) => {
        setLoading(true);
        try {
          const res = query ? await api.gifSearch(query) : await api.gifTrending();
          setResults(res.results || []);
        } catch (e) { toast.error(e.message); }
        setLoading(false);
      }, [toast]);

      // Single load path: the debounce effect covers the initial trending load
      // too — previously a second effect also called load('') on mount, so
      // trending was double-fetched and the responses could race.
      useEffect(() => {
        const t = setTimeout(() => load(q), 350);
        return () => clearTimeout(t);
      }, [q, load]);

      return (
        <Modal title="Pick a GIF" onClose={onClose}>
          <input className="form-input" placeholder="Search GIFs" value={q} autoFocus onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
          {loading ? <Spinner /> : (
            <div className="gif-grid metro-stagger">
              {results.map((g, i) => (
                <img key={i} src={g.thumb || g.url} onClick={() => { onPick(g.url); onClose(); }} alt="gif" />
              ))}
              {results.length === 0 && <div className="empty-state">No GIFs found.</div>}
            </div>
          )}
        </Modal>
      );
    };

    const UserRow = ({ user, onProfileClick, right }) => (
      <div className="list-row">
        <Avatar user={user} size={40} onClick={() => onProfileClick && onProfileClick(user.handle)} />
        <div className="user-info">
          <div className="user-name" onClick={() => onProfileClick && onProfileClick(user.handle)}>{user.name}</div>
          <div className="user-handle">+{user.handle}{user.status_text ? ` · ${user.status_emoji || ''} ${user.status_text}` : ''}</div>
        </div>
        {right}
      </div>
    );

    const RichText = ({ text, html, onMention }) => {
      const ref = useRef(null);
      useEffect(() => {
        if (!ref.current || !onMention) return;
        const handler = (e) => {
          const m = e.target.closest('.mention');
          if (m && m.dataset.handle) { e.preventDefault(); e.stopPropagation(); onMention(m.dataset.handle); }
        };
        ref.current.addEventListener('click', handler);
        return () => ref.current && ref.current.removeEventListener('click', handler);
      }, [onMention, text, html]);
      const htmlContent = html || formatText(text);
      return <div ref={ref} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
    };

    const MentionInput = ({
      value, onChange, onSubmit, multiline = false, autoGrow = false,
      className = 'form-input', placeholder, autoFocus, rows, style,
    }) => {
      const inputRef = useRef(null);
      const [open, setOpen] = useState(false);
      const [items, setItems] = useState([]);
      const [active, setActive] = useState(0);
      const [loading, setLoading] = useState(false);
      const [rect, setRect] = useState(null);
      const mentionRef = useRef(null);
      const seqRef = useRef(0);
      const debounceRef = useRef(null);

      const detect = (text, caret) => {
        const before = text.slice(0, caret);
        const m = before.match(/(?:^|\s)\+(\w*)$/);
        if (!m) return null;
        return { start: caret - m[1].length - 1, query: m[1] };
      };

      const runSearch = (q) => {
        const mySeq = ++seqRef.current;
        setLoading(true);
        const req = q.trim().length >= 1 ? api.searchUsers(q.trim()) : api.getFollowSuggestions();
        req.then((res) => {
          if (mySeq !== seqRef.current) return;
          setItems((res || []).slice(0, 6));
          setActive(0);
          setLoading(false);
        }).catch(() => { if (mySeq === seqRef.current) { setItems([]); setLoading(false); } });
      };

      const scheduleSearch = (q) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(q), 200);
      };

      const sync = (el) => {
        const ctx = detect(el.value, el.selectionStart);
        mentionRef.current = ctx;
        if (ctx) { setOpen(true); scheduleSearch(ctx.query); }
        else { setOpen(false); }
      };

      const handleChange = (e) => { onChange(e.target.value); sync(e.target); if (multiline && autoGrow) grow(e.target); };

      const grow = (el) => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 96) + 'px';
      };

      useEffect(() => {
        if (multiline && autoGrow && inputRef.current) grow(inputRef.current);
      }, [value, multiline, autoGrow]);

      const pick = (u) => {
        const ctx = mentionRef.current;
        const el = inputRef.current;
        if (!ctx || !el) return;
        const caret = el.selectionStart;
        const before = value.slice(0, ctx.start);
        const after = value.slice(caret);
        const insert = `+${u.handle} `;
        onChange(before + insert + after);
        setOpen(false);
        mentionRef.current = null;
        const pos = (before + insert).length;
        requestAnimationFrame(() => {
          if (inputRef.current) { inputRef.current.focus(); inputRef.current.setSelectionRange(pos, pos); }
        });
      };

      const handleKeyDown = (e) => {
        if (open && items.length > 0) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length); return; }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active]); return; }
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
        }
        if (onSubmit && e.key === 'Enter' && (!multiline || !e.shiftKey)) { e.preventDefault(); onSubmit(); }
      };

      // Keep the portaled menu anchored to the input while open.
      useEffect(() => {
        if (!open) { setRect(null); return; }
        const measure = () => { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); };
        measure();
        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);
        return () => {
          window.removeEventListener('scroll', measure, true);
          window.removeEventListener('resize', measure);
        };
      }, [open]);

      const MENU_MAX = 240;
      const above = rect && rect.top > MENU_MAX + 20;
      const menuStyle = rect ? {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      } : {};

      const commonProps = {
        ref: inputRef, className, placeholder, autoFocus,
        style: { width: '100%', ...(style || {}) },
        value, onChange: handleChange, onKeyDown: handleKeyDown,
        onKeyUp: (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) sync(e.target); },
        onClick: (e) => sync(e.target),
        onBlur: () => setTimeout(() => setOpen(false), 150),
      };

      return (
        <div className="mention-wrap">
          {multiline ? <textarea {...commonProps} rows={rows || 1} /> : <input {...commonProps} />}
          {open && rect && ReactDOM.createPortal(
            <div className="mention-menu" style={menuStyle}>
              {items.length === 0
                ? <div className="mention-empty">{loading ? 'searching…' : 'no matches'}</div>
                : items.map((u, i) => (
                  <div key={u.id} className={`mention-item ${i === active ? 'active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                    onMouseEnter={() => setActive(i)}>
                    <img src={u.photo_url || fallbackAvatar(u)} alt=""
                      onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(u); }} />
                    <div className="mention-meta">
                      <div className="mention-name">{u.name}</div>
                      <div className="mention-handle">+{u.handle}</div>
                    </div>
                  </div>
                ))}
            </div>,
            document.body
          )}
        </div>
      );
    };

export { EMOJIS, Avatar, Spinner, Modal, ConfirmDialog, EmojiPicker, GifPicker, UserRow, RichText, MentionInput };
