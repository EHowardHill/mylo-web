// src/dms.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { ChatView, Message } from './chat.js';
import { useToast, useUI } from './contexts.js';
import { I } from './icons.js';
import { tellSw } from './push.js';
import { Avatar, Spinner } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const PeoplePicker = ({ actionLabel = 'Message', onPick }) => {
      const [q, setQ] = useState('');
      const [results, setResults] = useState([]);
      const [suggestions, setSuggestions] = useState([]);
      const [busy, setBusy] = useState(false);

      useEffect(() => { api.getFollowSuggestions().then(s => setSuggestions(s || [])).catch(() => { }); }, []);
      useEffect(() => {
        if (q.trim().length < 2) { setResults([]); return; }
        let active = true;
        api.searchUsers(q.trim()).then(r => { if (active) setResults(r || []); }).catch(() => { });
        return () => { active = false; };
      }, [q]);

      const list = q.trim().length >= 2 ? results : suggestions;
      const pick = async (u) => { setBusy(true); await onPick(u); setBusy(false); };

      return (
        <div>
          <input className="form-input" placeholder="Search people…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="metro-stagger" style={{ marginTop: 12, maxHeight: 340, overflowY: 'auto' }}>
            {q.trim().length < 2 && <div className="folder-label">Suggestions</div>}
            {list.length === 0 && <div className="empty-state">{q.trim().length >= 2 ? 'No users found.' : 'No suggestions.'}</div>}
            {list.map(u => (
              <div key={u.id} className="list-row">
                <Avatar user={u} size={40} />
                <div className="user-info">
                  <div className="user-name">{u.name}</div>
                  <div className="user-handle">+{u.handle}</div>
                </div>
                <button className="btn btn-sm" disabled={busy} onClick={() => pick(u)}>{actionLabel}</button>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const DMsView = ({ onProfileClick }) => {
      const ui = useUI();
      const toast = useToast();
      const [convos, setConvos] = useState([]);
      const [loading, setLoading] = useState(true);

      const load = useCallback(async () => {
        setLoading(true);
        try { setConvos(await api.getConversations() || []); }
        catch (e) { toast.error(e.message); }
        setLoading(false);
      }, []);
      useEffect(() => { load(); }, [load]);

      const startNew = () => ui.openModal({
        title: 'New message', render: (close) => (
          <PeoplePicker onPick={async (u) => {
            try { const r = await api.startDM(u.id); close(); ui.goDM(r.circle.id); }
            catch (e) { toast.error(e.message); }
          }} />
        )
      });

      if (loading) return <Spinner />;
      return (
        <div className="feed-container metro-stagger">
          <div className="list-header">
            <h2>Messages</h2>
            <button className="btn" onClick={startNew}><I.Plus /> New</button>
          </div>
          {convos.length === 0 && <div className="card empty-state">No conversations yet. Start one!</div>}
          {convos.map((c) => {
            const ou = c.other_user;
            return (
              <div
                key={c.id}
                className={`card list-row ${c.has_unread ? 'has-unread' : ''}`}
                onClick={() => ui.goDM(c.id)}
                style={{ position: 'relative' }}
              >
                <Avatar
                  user={{
                    name: c.display_name,
                    photo_url: c.icon_url || (ou && ou.photo_url),
                    handle: ou && ou.handle,
                  }}
                  size={46}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="user-name">
                    {c.display_name}
                    {c.has_unread && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: 8,
                          background: 'var(--gplus-red)',
                          color: '#fff',
                          borderRadius: 10,
                          fontSize: 11,
                          padding: '1px 7px',
                          minWidth: 18,
                          textAlign: 'center',
                        }}
                      >
                        {c.unread_count || ''}
                      </span>
                    )}
                  </div>
                  <div
                    className="user-handle"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: c.has_unread ? 600 : 400,
                    }}
                  >
                    {c.last_message ? c.last_message.content : `${c.member_count} members`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const DMChatView = ({ circleId, onBack, onProfileClick }) => {
      const toast = useToast();
      const [circle, setCircle] = useState(null);
      const [channel, setChannel] = useState(null);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        let active = true;
        (async () => {
          setLoading(true);
          try {
            const [c, chs] = await Promise.all([api.getCircle(circleId), api.getChannels(circleId)]);
            if (!active) return;
            setCircle(c);
            const chat = (chs || []).find(ch => ch.channel_type === 'chat') || (chs || [])[0];
            setChannel(chat || null);
          } catch (e) { toast.error(e.message); }
          if (active) setLoading(false);
        })();
        return () => { active = false; };
      }, [circleId]);

      useEffect(() => {
        const cid = channel ? channel.id : null;
        if (cid) tellSw('context-focus', cid);
        return () => { if (cid) tellSw('context-blur', cid); };
      }, [channel ? channel.id : null]);

      if (loading) return <div className="dm-layout"><div className="chat-main"><Spinner /></div></div>;
      if (!channel) return <div className="dm-layout"><div className="chat-main"><div className="chat-header"><button className="icon-btn" onClick={onBack}><I.Back /></button><div className="title">Conversation</div></div><div className="empty-state">This conversation is unavailable.</div></div></div>;

      return (
        <div className="dm-layout">
          <ChatView
            channelId={channel.id}
            channelName={circle ? circle.name : 'Direct message'}
            channelDesc={circle && circle.member_count ? `${circle.member_count} members` : ''}
            canModerate={circle && circle.is_owner}
            onProfileClick={onProfileClick}
            headerExtra={<button className="icon-btn" onClick={onBack}><I.Back /></button>}
          />
        </div>
      );
    };

export { PeoplePicker, DMsView, DMChatView };
