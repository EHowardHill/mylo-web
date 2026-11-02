// src/chat.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { tmpId, useIsMounted, useOutsideClose } from './hooks.js';
import { I } from './icons.js';
import { InlineCompose, Post } from './posts.js';
import { Avatar, ConfirmDialog, EmojiPicker, GifPicker, MentionInput, RichText, Spinner } from './ui.js';
import { clockTime, fallbackAvatar, formatText } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const Message = ({ msg, canModerate, onProfileClick, onReply, onChanged, onDeleted, onRetry }) => {
      const auth = useAuth();
      const ui = useUI();
      const toast = useToast();
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(msg.content);
      const [showEmoji, setShowEmoji] = useState(false);
      const emojiWrapRef = useOutsideClose(showEmoji, () => setShowEmoji(false));
      const isAuthor = msg.author && msg.author.id === (auth.user && auth.user.id);
      // Optimistic/failed bubbles were never confirmed by the server — treat
      // them as local-only (delete skips the API, which would 404 on the tmp
      // id and re-insert the bubble via the failure path).
      const isLocalOnly = !!msg._pending || !!msg._failed || String(msg.id || '').indexOf('tmp_') === 0;

      if (msg.is_system) return <div className="msg-system">{msg.content}</div>;

      const react = async (emoji) => {
        const snap = msg.reactions;
        // Optimistic: toggle my reaction locally right away.
        const mine = (snap || []).find(r => r.me);
        let next;
        if (mine && mine.emoji === emoji) {
          next = (snap || []).map(r => r.emoji === emoji ? { ...r, count: r.count - 1, me: false } : r).filter(r => r.count > 0);
        } else {
          const existing = (snap || []).find(r => r.emoji === emoji);
          next = existing
            ? (snap || []).map(r => r.emoji === emoji ? { ...r, count: r.count + 1, me: true } : r)
            : [...(snap || []), { emoji, count: 1, me: true }];
          if (mine) next = next.map(r => r.emoji === mine.emoji ? { ...r, count: r.count - 1, me: false } : r).filter(r => r.count > 0);
        }
        onChanged({ ...msg, reactions: next });
        setShowEmoji(false);
        try {
          const res = await api.reactMessage(msg.id, emoji);
          onChanged({ ...msg, reactions: res.reactions });
        } catch (e) {
          onChanged({ ...msg, reactions: snap });
          toast.error(e.message);
        }
      };
      const pin = async () => {
        const snap = msg.pinned;
        // Optimistic: flip the pin flag instantly.
        onChanged({ ...msg, pinned: !snap });
        try {
          const res = await api.pinMessage(msg.id);
          onChanged({ ...msg, pinned: res.pinned });
          toast.show(res.pinned ? 'Pinned.' : 'Unpinned.');
        } catch (e) {
          onChanged({ ...msg, pinned: snap });
          toast.error(e.message);
        }
      };
      const saveEdit = async () => {
        const snap = { content: msg.content, content_html: msg.content_html, edited: msg.edited };
        // Optimistic: show the edited text immediately.
        onChanged({ ...msg, content: draft, content_html: formatText(draft), edited: true });
        setEditing(false);
        try {
          await api.editMessage(msg.id, draft);
        } catch (e) {
          onChanged({ ...msg, ...snap });
          setEditing(true);
          toast.error(e.message);
        }
      };
      const del = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Delete message?" message="This can't be undone." confirmLabel="Delete" danger
            onConfirm={async () => {
              if (isLocalOnly) {
                // Never reached the server — remove locally, no API call.
                onDeleted(msg.id);
                return;
              }
              const snap = msg;
              // Optimistic: remove it from the timeline right after confirming.
              onDeleted(msg.id);
              toast.show('Message deleted.');
              try { await api.deleteMessage(msg.id); }
              catch (e) {
                // Re-add at the end if the delete failed.
                onChanged(snap);
                toast.error(e.message);
                throw e;
              }
            }} onClose={close} />
        )
      });

      return (
        <div ref={emojiWrapRef} className={`msg ${msg._pending ? 'msg-pending' : ''} ${msg._failed ? 'msg-failed' : ''}`}>
          <Avatar user={msg.author} size={36} className="msg-avatar" onClick={() => msg.author && onProfileClick(msg.author.handle)} />
          <div className="msg-body">
            {msg.reply_to && <div className="msg-reply-ref">↩ {msg.reply_to.author_name}: {(msg.reply_to.content || '').slice(0, 80)}</div>}
            <div className="msg-meta">
              <span className="msg-author" onClick={() => msg.author && onProfileClick(msg.author.handle)}>{msg.author ? msg.author.name : 'Unknown'}</span>
              <span className="msg-time">{clockTime(msg.created_at)}{msg.edited ? ' · edited' : ''}</span>
              {msg.pinned && <span className="pinned-flag">📌 pinned</span>}
            </div>
            {editing ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <MentionInput className="form-input" value={draft} onChange={setDraft} onSubmit={saveEdit} autoFocus />
                <button className="btn btn-sm" onClick={saveEdit}>Save</button>
                <button className="btn btn-sm btn-outline" onClick={() => { setEditing(false); setDraft(msg.content); }}>Cancel</button>
              </div>
            ) : (
              <div className="msg-text">
                <RichText text={msg.content} html={msg.content_html} onMention={onProfileClick} />
              </div>
            )}
            {msg.image_url && <img className="msg-attach-img" src={msg.image_url} alt="attachment" onClick={() => ui.openLightbox(msg.image_url)} />}
            {msg.is_video && msg.file_url && !msg.image_url && (
              <div className="msg-media-embed">
                <video src={msg.file_url} controls preload="metadata" style={{ width: '100%', maxHeight: 320, borderRadius: 0 }} />
              </div>
            )}
            {msg.is_audio && msg.file_url && !msg.image_url && (
              <div className="msg-media-embed">
                <audio src={msg.file_url} controls preload="metadata" style={{ width: '100%' }} />
              </div>
            )}
            {msg.file_url && !msg.image_url && !msg.is_video && !msg.is_audio && (
              <a className="msg-file" href={msg.file_url} target="_blank" rel="noopener noreferrer">
                <I.Attach /> {msg.file_name || 'Attachment'} {msg.file_size ? `· ${(msg.file_size / 1024 / 1024).toFixed(1)}MB` : ''}
              </a>
            )}
            {msg.reactions && msg.reactions.length > 0 && (
              <div className="reactions">
                {msg.reactions.map(r => (
                  <span key={r.emoji} className={`reaction-chip ${r.me ? 'me' : ''}`} onClick={() => react(r.emoji)}>{r.emoji} {r.count}</span>
                ))}
              </div>
            )}
            {msg._failed && (
              <div className="msg-failed-row">
                <span>Not sent</span>
                <button className="link-btn" onClick={() => onRetry && onRetry(msg)}>Retry</button>
                <button className="link-btn msg-failed-dismiss" onClick={() => onDeleted(msg.id)}>Dismiss</button>
              </div>
            )}
          </div>
          {!msg._failed && (
            <div className="msg-tools">
              <button className="icon-btn" title="React" onClick={() => setShowEmoji(s => !s)}><I.Emoji /></button>
              <button className="icon-btn" title="Reply" onClick={() => onReply(msg)}><I.Reply /></button>
              {(isAuthor || canModerate) && <button className="icon-btn" title="Pin" onClick={pin}><I.Pin /></button>}
              {isAuthor && <button className="icon-btn" title="Edit" onClick={() => { setDraft(msg.content); setEditing(true); }}><I.Edit /></button>}
              {(isAuthor || canModerate) && <button className="icon-btn" title="Delete" onClick={del}><I.Trash /></button>}
            </div>
          )}
          {showEmoji && (
            <div className="card dropdown-menu metro-anim" style={{ position: 'absolute', right: 8, top: 24, zIndex: 30, padding: 8, margin: 0 }} onMouseLeave={() => setShowEmoji(false)}>
              <EmojiPicker onPick={react} />
            </div>
          )}
        </div>
      );
    };

    const ChatView = ({ channelId, channelName, channelDesc, canModerate, canPost = true, onProfileClick, headerExtra }) => {
      const auth = useAuth();
      const toast = useToast();
      const ui = useUI();
      const [messages, setMessages] = useState([]);
      const [loading, setLoading] = useState(true);
      const [loadingMore, setLoadingMore] = useState(false);
      const [hasMore, setHasMore] = useState(true);
      const [text, setText] = useState('');
      const [file, setFile] = useState(null);
      const [replyTo, setReplyTo] = useState(null);
      const [sending, setSending] = useState(false);
      const sendingRef = useRef(false);
      const [alertOn, setAlertOn] = useState(false);
      const [showPinned, setShowPinned] = useState(false);
      const [pinnedMessages, setPinnedMessages] = useState([]);
      const [gifOpen, setGifOpen] = useState(false);
      const scrollRef = useRef(null);
      const fileRef = useRef(null);
      const [typingUsers, setTypingUsers] = useState([]);
      const atBottomRef = useRef(true);
      const myIdRef = useRef(null);
      const typingTimersRef = useRef({});
      const lastTypingSentRef = useRef(0);
      const isMounted = useIsMounted();
      // Track blob preview URLs so they can be revoked once the server's real
      // message (or a dismissal) replaces the optimistic preview.
      const blobUrlsRef = useRef(new Set());
      useEffect(() => () => {
        blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
        blobUrlsRef.current.clear();
      }, []);
      const trackBlob = (url) => { blobUrlsRef.current.add(url); return url; };
      const releaseBlob = (url) => {
        if (url && blobUrlsRef.current.has(url)) {
          blobUrlsRef.current.delete(url);
          URL.revokeObjectURL(url);
        }
      };

      const load = useCallback(async () => {
        setLoading(true);
        try {
          const res = await api.getMessages(channelId, { limit: 50 });
          setMessages(res || []);
          setHasMore((res || []).length >= 50);
          await api.markChannelRead(channelId).catch(() => { });
          ui.refreshBadges();
        } catch (e) { toast.error(e.message); }
        setLoading(false);
      }, [channelId, toast, ui]);

      useEffect(() => {
        load();
        api.getChannelAlert(channelId).then(r => setAlertOn(!!r.enabled)).catch(() => { });
      }, [load, channelId]);

      // Keep my own user id in a ref so the SSE handlers (which close over it)
      // don't need `auth.user` as a dependency — the stream stays open across
      // a refreshUser() call rather than tearing down on every user-state change.
      useEffect(() => { myIdRef.current = auth.user ? auth.user.id : null; }, [auth.user]);

      // Track whether the scroll container is pinned to the bottom, so incoming
      // real-time messages only auto-scroll when the user is already reading the
      // latest (Discord-style). A user scrolled up reading history stays put.
      useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
          atBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
      }, []);

      useEffect(() => {
        if (!loading && scrollRef.current && !loadingMore && atBottomRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, [messages, loading, loadingMore]);

      // Real-time: Server-Sent Events subscription for this channel.
      // Reconnects automatically (EventSource) and re-subscribes on channel switch.
      useEffect(() => {
        const es = new EventSource(api.channelStreamUrl(channelId), { withCredentials: true });
        const clearTypingTimer = (uid) => {
          if (typingTimersRef.current[uid]) {
            clearTimeout(typingTimersRef.current[uid]);
            delete typingTimersRef.current[uid];
          }
        };
        const onMessage = (e) => {
          try {
            const m = JSON.parse(e.data);
            setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
          } catch { }
        };
        const onEdit = (e) => {
          try {
            const d = JSON.parse(e.data);
            setMessages(prev => prev.map(x => x.id === d.id ? { ...x, ...d } : x));
          } catch { }
        };
        const onDelete = (e) => {
          try {
            const d = JSON.parse(e.data);
            setMessages(prev => prev.filter(x => x.id !== d.id));
          } catch { }
        };
        const onReaction = (e) => {
          try {
            const d = JSON.parse(e.data);
            setMessages(prev => prev.map(x => x.id === d.message_id ? { ...x, reactions: d.reactions } : x));
          } catch { }
        };
        const onPin = (e) => {
          try {
            const d = JSON.parse(e.data);
            setMessages(prev => prev.map(x => x.id === d.message_id ? { ...x, pinned: d.pinned } : x));
          } catch { }
        };
        const onTyping = (e) => {
          try {
            const d = JSON.parse(e.data);
            const u = d.user;
            if (!u || u.id === myIdRef.current) return;   // never show my own typing
            if (d.state === 'stop') {
              setTypingUsers(prev => prev.filter(x => x.id !== u.id));
              clearTypingTimer(u.id);
            } else {
              setTypingUsers(prev => prev.some(x => x.id === u.id) ? prev : [...prev, u]);
              clearTypingTimer(u.id);
              typingTimersRef.current[u.id] = setTimeout(() => {
                setTypingUsers(prev => prev.filter(x => x.id !== u.id));
                delete typingTimersRef.current[u.id];
              }, 4500);
            }
          } catch { }
        };
        es.addEventListener('message', onMessage);
        es.addEventListener('message_edit', onEdit);
        es.addEventListener('message_delete', onDelete);
        es.addEventListener('reaction', onReaction);
        es.addEventListener('pin', onPin);
        es.addEventListener('typing', onTyping);
        // EventSource auto-reconnects on transient errors; nothing to do here.
        return () => {
          es.close();
          Object.values(typingTimersRef.current).forEach(t => clearTimeout(t));
          typingTimersRef.current = {};
          if (isMounted.current) setTypingUsers([]);
        };
      }, [channelId]);


      const loadMore = async () => {
        if (!messages.length) return;
        setLoadingMore(true);
        const prevH = scrollRef.current.scrollHeight;
        try {
          const res = await api.getMessages(channelId, { limit: 50, before: messages[0].id });
          if (!res || res.length === 0) setHasMore(false);
          else {
            setMessages(prev => [...res, ...prev]);
            if (res.length < 50) setHasMore(false);
            requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevH; });
          }
        } catch (e) { toast.error(e.message); }
        setLoadingMore(false);
      };

      const send = async () => {
        if (sendingRef.current) return;
        if (!text.trim() && !file) return;
        sendingRef.current = true;
        setSending(true);
        // Generate a per-attempt idempotency key so a retried/duplicated
        // request (e.g. user double-tapping send during lag) is deduped by
        // the server and returns the original message instead of creating a
        // duplicate.
        const idempotencyKey = (crypto.randomUUID && crypto.randomUUID())
          || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        atBottomRef.current = true;
        // --- Optimistic send (Instagram-style): show the message instantly ---
        const tmp = tmpId();
        const optimistic = {
          id: tmp,
          _pending: true,
          content: text,
          author: auth.user,
          created_at: new Date().toISOString(),
          reply_to: replyTo ? { ...replyTo, author_name: (replyTo.author && replyTo.author.name) || '' } : null,
          image_url: file && file.type && file.type.startsWith('image/') ? trackBlob(URL.createObjectURL(file)) : null,
          file_name: file ? file.name : null,
          _file: file || null,
        };
        setMessages(prev => [...prev, optimistic]);
        setText(''); setFile(null); setReplyTo(null);
        if (fileRef.current) fileRef.current.value = '';
        requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
        try {
          let body;
          if (file) {
            body = new FormData();
            body.append('content', text);
            body.append('file', file);
            if (replyTo) body.append('reply_to', replyTo.id);
          } else {
            body = { content: text, reply_to: replyTo ? replyTo.id : null };
          }
          const res = await api.sendMessage(channelId, body, idempotencyKey);
          // Reconcile: swap the temp message for the server's real one.
          // Deduped against the SSE echo (which may have arrived first):
          // if the real id is already in the list, just drop the temp copy.
          setMessages(prev => {
            const realId = res.message && res.message.id;
            if (realId && prev.some(x => x.id === realId)) return prev.filter(x => x.id !== tmp);
            return prev.map(x => x.id === tmp ? res.message : x);
          });
          releaseBlob(optimistic.image_url);
          api.sendTyping(channelId, 'stop').catch(() => { });
          lastTypingSentRef.current = 0;
          requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
        } catch (e) {
          // Rollback: flag the bubble as failed. Its content (and File) stay
          // on the bubble, which offers Retry / Dismiss — the composer was
          // already cleared optimistically, so nothing is duplicated.
          setMessages(prev => prev.map(x => x.id === tmp ? { ...x, _pending: false, _failed: true } : x));
          toast.error(e.message);
        }
        sendingRef.current = false;
        setSending(false);
      };

      // Re-send a failed bubble with its original content and a fresh
      // idempotency key (a new key is required per attempt so the server
      // doesn't dedupe the retry into the failed original).
      const retrySend = async (failed) => {
        if (sendingRef.current) return;
        const file = failed._file || null;
        if ((!failed.content || !failed.content.trim()) && !file) return;
        sendingRef.current = true;
        setSending(true);
        const idempotencyKey = (crypto.randomUUID && crypto.randomUUID())
          || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        atBottomRef.current = true;
        const tmp = failed.id;
        // Optimistic: flip the bubble back to pending while the retry flies.
        setMessages(prev => prev.map(x => x.id === tmp ? { ...x, _pending: true, _failed: false } : x));
        requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
        try {
          let body;
          if (file) {
            body = new FormData();
            body.append('content', failed.content);
            body.append('file', file);
            if (failed.reply_to && failed.reply_to.id) body.append('reply_to', failed.reply_to.id);
          } else {
            body = { content: failed.content, reply_to: failed.reply_to && failed.reply_to.id ? failed.reply_to.id : null };
          }
          const res = await api.sendMessage(channelId, body, idempotencyKey);
          setMessages(prev => {
            const realId = res.message && res.message.id;
            if (realId && prev.some(x => x.id === realId)) return prev.filter(x => x.id !== tmp);
            return prev.map(x => x.id === tmp ? res.message : x);
          });
          releaseBlob(failed.image_url);
          api.sendTyping(channelId, 'stop').catch(() => { });
          lastTypingSentRef.current = 0;
          requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
        } catch (e) {
          setMessages(prev => prev.map(x => x.id === tmp ? { ...x, _pending: false, _failed: true } : x));
          toast.error(e.message);
        }
        sendingRef.current = false;
        setSending(false);
      };

      // Typing input: drive the typing indicator by POSTing state changes,
      // debounced to ~once per 2s while actively typing (like Discord). Clearing
      // the field or sending immediately announces "stop".
      const handleTextChange = (val) => {
        setText(val);
        if (!canPost) return;
        const now = Date.now();
        if (val.trim() && now - lastTypingSentRef.current > 2000) {
          lastTypingSentRef.current = now;
          api.sendTyping(channelId, 'typing').catch(() => { });
        } else if (!val.trim() && lastTypingSentRef.current) {
          lastTypingSentRef.current = 0;
          api.sendTyping(channelId, 'stop').catch(() => { });
        }
      };

      // Upsert: reconcile by id, or re-insert (at the end) if the message was
      // optimistically removed and the delete later failed.
      const onChanged = (m) => setMessages(prev => prev.some(x => x.id === m.id)
        ? prev.map(x => x.id === m.id ? m : x)
        : [...prev, m]);
      const onDeleted = (id) => setMessages(prev => {
        const m = prev.find(x => x.id === id);
        if (m && m.image_url) releaseBlob(m.image_url);
        return prev.filter(x => x.id !== id);
      });
      const toggleAlert = async () => {
        const prev = alertOn;
        // Optimistic: flip the alert state instantly.
        setAlertOn(!prev);
        toast.show(prev ? 'Alerts off.' : 'Alerts on.');
        try {
          await api.toggleChannelAlert(channelId);
        } catch (e) {
          setAlertOn(prev);
          toast.error(e.message);
        }
      };
      const loadPinned = async () => {
        try {
          const res = await api.getMessages(channelId, { pinned: 'true', limit: 50 });
          setPinnedMessages(res || []);
          setShowPinned(true);
        } catch (e) { toast.error(e.message); }
      };

      return (
        <div className="chat-main page-transition">
          <div className="chat-header">
            {headerExtra}
            <div style={{ flex: 1 }}>
              <div className="title">#{channelName}</div>
              {channelDesc && <div className="desc">{channelDesc}</div>}
            </div>
            {showPinned ? <button className="btn btn-sm btn-outline" onClick={() => setShowPinned(false)}>Back to chat</button>
              : <button className="icon-btn" title="Pinned" onClick={loadPinned}><I.Pin /></button>}
            <button className="icon-btn" title={alertOn ? 'Alerts on' : 'Alerts off'} onClick={toggleAlert} style={{ color: alertOn ? 'var(--gplus-red)' : undefined }}><I.Bell /></button>
          </div>

          <div className="messages-scroll" ref={scrollRef}>
            {showPinned ? (
              <>
                <div className="folder-label">Pinned messages</div>
                {(pinnedMessages.length === 0) && <div className="empty-state">No pinned messages.</div>}
                {pinnedMessages.map(m => <Message key={m.id} msg={m} canModerate={canModerate} onProfileClick={onProfileClick} onReply={() => { }} onChanged={onChanged} onDeleted={onDeleted} onRetry={retrySend} />)}
              </>
            ) : loading ? <Spinner /> : (
              <>
                {hasMore && <button className="btn btn-outline btn-sm" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load earlier'}</button>}
                {messages.length === 0 && <div className="empty-state">No messages yet. Say hi 👋</div>}
                {messages.map(m => <Message key={m.id} msg={m} canModerate={canModerate} onProfileClick={onProfileClick} onReply={setReplyTo} onChanged={onChanged} onDeleted={onDeleted} onRetry={retrySend} />)}
              </>
            )}
          </div>

          {!showPinned && typingUsers.length > 0 && (
            <div className="typing-bar">
              <span className="typing-avatars">
                {typingUsers.slice(0, 3).map(u => (
                  <img key={u.id} src={u.photo_url || fallbackAvatar(u)} className="typing-avatar" alt=""
                    onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(u); }} />
                ))}
              </span>
              <span className="typing-text">
                {typingUsers.length === 1
                  ? `${typingUsers[0].name} is typing`
                  : typingUsers.length === 2
                    ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
                    : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing`}
              </span>
              <span className="typing-dots"><span></span><span></span><span></span></span>
            </div>
          )}

          {!showPinned && (
            canPost ? (
            <div className="composer">
              {replyTo && <div className="composer-reply"><span>Replying to {replyTo.author ? replyTo.author.name : ''}</span><button className="icon-btn" onClick={() => setReplyTo(null)}><I.Close /></button></div>}
              {file && <div className="chip">{file.name}<button onClick={() => setFile(null)}>×</button></div>}
              <div className="composer-row">
                <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={e => { setFile(e.target.files[0]); e.target.value = ''; }} />
                <button className="icon-btn" onClick={() => fileRef.current.click()}><I.Attach /></button>
                <button className="icon-btn" onClick={() => setGifOpen(true)}><I.Gif /></button>
                <MentionInput multiline className="composer-input" rows={1}
                  placeholder={`Message #${channelName}`} value={text}
                  onChange={handleTextChange} onSubmit={send} />
                <button className="btn" onClick={send} disabled={sending}><I.Send /></button>
              </div>
              {gifOpen && <GifPicker onClose={() => setGifOpen(false)} onPick={(url) => setText(t => (t ? t + ' ' : '') + url)} />}
            </div>
            ) : (
              <div className="composer" style={{ justifyContent: 'center', alignItems: 'center', color: 'var(--gplus-text-secondary)', fontStyle: 'italic', padding: '12px' }}>
                Only the circle owner can post in this channel.
              </div>
            )
          )}
        </div>
      );
    };

    const ChannelFeed = ({ channelId, channelName, canPost = true, onProfileClick }) => {
      const ui = useUI();
      const toast = useToast();
      const [posts, setPosts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [loadingMore, setLoadingMore] = useState(false);
      const [hasMore, setHasMore] = useState(false);
      const [offset, setOffset] = useState(0);
      const [showPinned, setShowPinned] = useState(false);
      const [pinnedPosts, setPinnedPosts] = useState([]);
      // Request-id guard (same pattern as the main feed): a reset (channel
      // switch, compose refresh) supersedes any in-flight "load older" fetch.
      const reqIdRef = useRef(0);
      const load = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setLoadingMore(false);
        try {
          const res = await api.getFeed({ channel_id: channelId, limit: 20 });
          if (reqId !== reqIdRef.current) return;
          const np = res.posts || [];
          setPosts(np);
          setOffset(np.length);
          // Full page => there may be more; a short page => we're at the beginning.
          setHasMore(np.length >= 20);
          ui.refreshBadges();
        }
        catch (e) { if (reqId === reqIdRef.current) console.error(e); }
        if (reqId === reqIdRef.current) setLoading(false);
      }, [channelId, ui]);
      useEffect(() => { load(); }, [load]);
      // Go back to older posts — reuses the main feed's pagination params
      // (before/before_id cursor, offset fallback) against the same endpoint,
      // so the backend needs no changes.
      const loadOlder = async () => {
        if (loading || loadingMore) return;
        const last = posts[posts.length - 1];
        if (!last) return;
        const reqId = ++reqIdRef.current;
        setLoadingMore(true);
        try {
          const params = { channel_id: channelId, limit: 20 };
          if (last.timestamp_iso) {
            params.before = last.timestamp_iso;
            params.before_id = last.id;
          } else {
            params.offset = offset;
          }
          const res = await api.getFeed(params);
          if (reqId !== reqIdRef.current) return;
          const raw = res.posts || [];
          setPosts(prev => {
            const seen = new Set(prev.map(p => p.id));
            return [...prev, ...raw.filter(p => !seen.has(p.id))];
          });
          setOffset(prev => prev + raw.length);
          // Full page with at least one new post => keep going. A full page
          // of pure duplicates means the cursor was ignored/re-served — stop.
          const fresh = raw.filter(p => !posts.some(x => x.id === p.id)).length;
          setHasMore(raw.length >= 20 && fresh > 0);
        } catch (e) { if (reqId === reqIdRef.current) toast.error(e.message); }
        if (reqId === reqIdRef.current) setLoadingMore(false);
      };
      const loadPinned = async () => {
        try {
          const res = await api.getFeed({ channel_id: channelId, pinned: 'true', limit: 50 });
          setPinnedPosts(res.posts || []);
          setShowPinned(true);
        } catch (e) { toast.error(e.message); }
      };
      return (
        <div className="chat-main page-transition">
          <div className="chat-header">
            <div style={{ flex: 1 }}><div className="title">#{channelName}</div><div className="desc">Feed channel</div></div>
            {showPinned
              ? <button className="btn btn-sm btn-outline" onClick={() => setShowPinned(false)}>Back to feed</button>
              : <button className="icon-btn" title="Pinned" onClick={loadPinned}><I.Pin /></button>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="feed-container metro-stagger">
              {showPinned ? (
                <>
                  <div className="folder-label">Pinned posts</div>
                  {pinnedPosts.length === 0 && <div className="card empty-state">No pinned posts.</div>}
                  {pinnedPosts.map(p => <Post key={p.id} post={p} onProfileClick={onProfileClick}
                    onUpdate={(np) => setPinnedPosts(prev => prev.map(x => x.id === np.id ? np : x))}
                    onDeleted={(id) => setPinnedPosts(prev => prev.filter(x => x.id !== id))}
                    onRestored={(p) => setPinnedPosts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])} />)}
                </>
              ) : (
                <>
                  {canPost ? <InlineCompose onOpen={() => ui.openCompose({ defaultChannelId: channelId, onCreated: load })} />
                    : <div className="empty-state" style={{ fontStyle: 'italic' }}>Only the circle owner can post in this channel.</div>}
                  {loading ? <Spinner /> : posts.length === 0 ? <div className="empty-state">No posts in this channel yet.</div> : (
                    <>
                      {posts.map(p => <Post key={p.id} post={p} onProfileClick={onProfileClick}
                        onUpdate={(np) => setPosts(prev => prev.map(x => x.id === np.id ? np : x))}
                        onDeleted={(id) => setPosts(prev => prev.filter(x => x.id !== id))}
                        onRestored={(p) => setPosts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])} />)}
                      <div style={{ textAlign: 'center', padding: 8 }}>
                        {hasMore
                          ? <button className="btn btn-outline btn-sm" onClick={loadOlder} disabled={loadingMore}>
                            {loadingMore ? 'Loading…' : 'Load older posts'}
                          </button>
                          : <div className="empty-state" style={{ fontStyle: 'italic' }}>You've reached the beginning of this channel.</div>}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    };

export { Message, ChatView, ChannelFeed };
