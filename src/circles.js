// src/circles.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { ChannelFeed, ChatView } from './chat.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { tmpId } from './hooks.js';
import { I } from './icons.js';
import { tellSw } from './push.js';
import { Avatar, ConfirmDialog, Spinner, UserRow } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const CircleSettings = ({ circle, onClose, onChanged, onDeleted, onLeft }) => {
      const auth = useAuth();
      const ui = useUI();
      const toast = useToast();
      const [tab, setTab] = useState('general');
      const [name, setName] = useState(circle.name);
      const [isPublic, setIsPublic] = useState(circle.is_public);
      const [invite, setInvite] = useState(circle.invite_code);
      const [members, setMembers] = useState([]);
      const [layout, setLayout] = useState({ channels: [], folders: [] });
      const iconRef = useRef(null);
      const bannerRef = useRef(null);
      const isOwner = circle.is_owner;

      const reloadLayout = useCallback(() => api.getLayout(circle.id).then(setLayout).catch(() => { }), [circle.id]);
      useEffect(() => {
        api.getMembers(circle.id).then(setMembers).catch(() => { });
        reloadLayout();
      }, [circle.id, reloadLayout]);

      const saveGeneral = async () => {
        const snap = { name: circle.name, is_public: circle.is_public };
        // Optimistic: apply name/public toggle instantly.
        onChanged && onChanged({ ...circle, name, is_public: isPublic });
        toast.show('Saved.');
        try { await api.updateCircle(circle.id, { name, is_public: isPublic }); }
        catch (e) {
          onChanged && onChanged({ ...circle, ...snap });
          toast.error(e.message);
        }
      };
      const uploadImg = async (e, kind) => {
        const f = e.target.files[0]; if (!f) return;
        const fd = new FormData(); fd.append('file', f);
        try {
          const res = kind === 'icon' ? await api.uploadCircleIcon(circle.id, fd) : await api.uploadCircleBanner(circle.id, fd);
          toast.show('Updated.');
          onChanged && onChanged(kind === 'icon' ? { ...circle, icon_url: res.url } : { ...circle, banner_url: res.url });
        }
        catch (err) { toast.error(err.message); }
        e.target.value = '';
      };
      const resetInvite = async () => {
        try { const res = await api.resetInvite(circle.id); setInvite(res.invite_code); toast.show('New invite generated.'); }
        catch (e) { toast.error(e.message); }
      };
      const kick = async (uid) => {
        const idx = members.findIndex(m => m.id === uid);
        if (idx < 0) return;
        const removed = members[idx];
        // Optimistic: remove from the member list instantly.
        setMembers(m => m.filter(x => x.id !== uid));
        toast.show('Removed.');
        try {
          await api.kickMember(circle.id, uid);
        } catch (e) {
          // Re-insert at the original index if the kick failed.
          setMembers(m => { const next = [...m]; next.splice(Math.min(idx, next.length), 0, removed); return next; });
          toast.error(e.message);
        }
      };
      const transfer = (m) => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Transfer ownership?" message={`Make ${m.name} the new owner? You'll become a regular member.`} confirmLabel="Transfer"
            onConfirm={async () => { await api.transferOwnership(circle.id, m.id); toast.show('Ownership transferred.'); onChanged && onChanged({ ...circle, is_owner: false }); onClose(); }} onClose={close} />
        )
      });
      const del = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Delete circle?" message="This removes all channels and messages permanently." confirmLabel="Delete" danger
            onConfirm={async () => { await api.deleteCircle(circle.id); toast.show('Circle deleted.'); onDeleted(circle.id); onClose(); }} onClose={close} />
        )
      });
      const leave = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Leave circle?" message="You'll need an invite to rejoin if it's private." confirmLabel="Leave" danger
            onConfirm={async () => { await api.leaveCircle(circle.id); toast.show('Left circle.'); onLeft(circle.id); onClose(); }} onClose={close} />
        )
      });

      const addChannel = async () => {
        const cn = (prompt('Channel name') || '').trim(); if (!cn) return;
        const temp = { id: tmpId(), name: cn, channel_type: 'chat', folder_id: null, _pending: true };
        // Optimistic: show the new channel immediately.
        setLayout(l => ({ ...l, channels: [...l.channels, temp] }));
        try {
          await api.createChannel(circle.id, { name: cn, channel_type: 'chat', folder_id: null });
          reloadLayout();   // reconcile with server truth
        } catch (e) {
          setLayout(l => ({ ...l, channels: l.channels.filter(c => c.id !== temp.id) }));
          toast.error(e.message);
        }
      };
      const renameChannel = async (ch) => {
        const nn = (prompt('New channel name', ch.name) || '').trim(); if (!nn || nn === ch.name) return;
        // Optimistic: apply the rename instantly.
        setLayout(l => ({ ...l, channels: l.channels.map(c => c.id === ch.id ? { ...c, name: nn } : c) }));
        try {
          await api.updateChannel(circle.id, ch.id, { name: nn });
        } catch (e) {
          setLayout(l => ({ ...l, channels: l.channels.map(c => c.id === ch.id ? { ...c, name: ch.name } : c) }));
          toast.error(e.message);
        }
      };
      const toggleOwnerOnly = async (ch) => {
        const next = !ch.owner_only_posts;
        // Optimistic: flip the lock instantly.
        setLayout(l => ({ ...l, channels: l.channels.map(c => c.id === ch.id ? { ...c, owner_only_posts: next } : c) }));
        try {
          await api.updateChannel(circle.id, ch.id, { owner_only_posts: next });
        } catch (e) {
          setLayout(l => ({ ...l, channels: l.channels.map(c => c.id === ch.id ? { ...c, owner_only_posts: !next } : c) }));
          toast.error(e.message);
        }
      };
      const delChannel = async (ch) => {
        const idx = layout.channels.findIndex(c => c.id === ch.id);
        // Optimistic: remove it from the list instantly.
        setLayout(l => ({ ...l, channels: l.channels.filter(c => c.id !== ch.id) }));
        try {
          await api.deleteChannel(circle.id, ch.id);
        } catch (e) {
          // Re-insert at the original index if the delete failed.
          setLayout(l => { const next = [...l.channels]; next.splice(Math.min(idx, next.length), 0, ch); return { ...l, channels: next }; });
          toast.error(e.message);
        }
      };
      const moveChannel = async (idx, dir) => {
        const chs = [...layout.channels];
        const j = idx + dir; if (j < 0 || j >= chs.length) return;
        [chs[idx], chs[j]] = [chs[j], chs[idx]];
        const payload = chs.map((c, i) => ({ id: c.id, position: i, folder_id: c.folder_id || null }));
        setLayout(l => ({ ...l, channels: chs }));
        try { await api.reorderChannels(circle.id, payload); } catch (e) { toast.error(e.message); reloadLayout(); }
      };
      const addFolder = async () => {
        const fn = (prompt('Folder name') || '').trim(); if (!fn) return;
        const temp = { id: tmpId(), name: fn, _pending: true };
        // Optimistic: show the new folder immediately.
        setLayout(l => ({ ...l, folders: [...l.folders, temp] }));
        try {
          await api.createFolder(circle.id, fn);
          reloadLayout();   // reconcile with server truth
        } catch (e) {
          setLayout(l => ({ ...l, folders: l.folders.filter(f => f.id !== temp.id) }));
          toast.error(e.message);
        }
      };
      const renameFolder = async (f) => {
        const nn = (prompt('New folder name', f.name) || '').trim(); if (!nn || nn === f.name) return;
        // Optimistic: apply the rename instantly.
        setLayout(l => ({ ...l, folders: l.folders.map(x => x.id === f.id ? { ...x, name: nn } : x) }));
        try {
          await api.updateFolder(circle.id, f.id, { name: nn });
        } catch (e) {
          setLayout(l => ({ ...l, folders: l.folders.map(x => x.id === f.id ? { ...x, name: f.name } : x) }));
          toast.error(e.message);
        }
      };
      const delFolder = async (f) => {
        const idx = layout.folders.findIndex(x => x.id === f.id);
        // Optimistic: remove it instantly.
        setLayout(l => ({ ...l, folders: l.folders.filter(x => x.id !== f.id) }));
        try {
          await api.deleteFolder(circle.id, f.id);
        } catch (e) {
          setLayout(l => { const next = [...l.folders]; next.splice(Math.min(idx, next.length), 0, f); return { ...l, folders: next }; });
          toast.error(e.message);
        }
      };
      const moveFolder = async (idx, dir) => {
        const fs = [...layout.folders];
        const j = idx + dir; if (j < 0 || j >= fs.length) return;
        [fs[idx], fs[j]] = [fs[j], fs[idx]];
        setLayout(l => ({ ...l, folders: fs }));
        try {
          await api.reorderFolders(circle.id, fs.map(f => f.id));
          const fresh = await api.getFolders(circle.id);
          if (Array.isArray(fresh)) setLayout(l => ({ ...l, folders: fresh }));
        } catch (e) { toast.error(e.message); reloadLayout(); }
      };

      return (
        <>
          <div className="card tabs tabs-compact">
            <div className={`tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>General</div>
            <div className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</div>
            {isOwner && <div className={`tab ${tab === 'channels' ? 'active' : ''}`} onClick={() => setTab('channels')}>Channels</div>}
            <div className={`tab ${tab === 'danger' ? 'active' : ''}`} onClick={() => setTab('danger')}>Danger zone</div>
          </div>

          {tab === 'general' && (
            <div className="metro-anim">
              <div className="form-group"><label>Name</label>
                <input className="form-input" value={name} disabled={!isOwner} onChange={e => setName(e.target.value)} /></div>
              {isOwner && (
                <div className="settings-row" style={{ padding: '8px 0' }}>
                  <span>Public (discoverable)</span>
                  <label className="toggle-switch"><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /><span className="slider"></span></label>
                </div>
              )}
              <div className="form-group"><label>Invite code</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" readOnly value={invite || ''} onFocus={e => e.target.select()} />
                  {isOwner && <button className="btn btn-outline" onClick={resetInvite}>Reset</button>}
                </div>
              </div>
              {isOwner && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="file" ref={iconRef} accept="image/*" style={{ display: 'none' }} onChange={e => uploadImg(e, 'icon')} />
                  <input type="file" ref={bannerRef} accept="image/*" style={{ display: 'none' }} onChange={e => uploadImg(e, 'banner')} />
                  <button className="btn btn-outline" onClick={() => iconRef.current.click()}>Upload icon</button>
                  <button className="btn btn-outline" onClick={() => bannerRef.current.click()}>Upload banner</button>
                </div>
              )}
              {isOwner && <button className="btn" onClick={saveGeneral}>Save changes</button>}
            </div>
          )}

          {tab === 'members' && (
            <div className="metro-stagger">
              {members.map(m => (
                <UserRow key={m.id} user={m} onProfileClick={(h) => { onClose(); ui.goProfile(h); }}
                  right={<div style={{ display: 'flex', gap: 6 }}>
                    {m.is_owner && <span className="chip">Owner</span>}
                    {isOwner && !m.is_owner && <button className="btn btn-sm btn-outline" onClick={() => transfer(m)}>Make owner</button>}
                    {isOwner && m.id !== (auth.user && auth.user.id) && !m.is_owner && <button className="btn btn-sm btn-danger" onClick={() => kick(m.id)}>Kick</button>}
                  </div>} />
              ))}
            </div>
          )}

          {tab === 'channels' && isOwner && (
            <div className="metro-stagger">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={addChannel}>+ Channel</button>
                <button className="btn btn-outline btn-sm" onClick={addFolder}>+ Folder</button>
              </div>
              {layout.folders.map((f, i) => (
                <div key={f.id} className="list-row">
                  <span style={{ flex: 1, fontWeight: 600 }}>📁 {f.name}</span>
                  <button className="icon-btn" onClick={() => moveFolder(i, -1)}>▲</button>
                  <button className="icon-btn" onClick={() => moveFolder(i, 1)}>▼</button>
                  <button className="link-btn" onClick={() => renameFolder(f)}>Rename</button>
                  <button className="link-btn" onClick={() => delFolder(f)} style={{ color: '#b00020' }}>Delete</button>
                </div>
              ))}
              {layout.channels.map((ch, i) => (
                <div key={ch.id} className="list-row">
                  <span style={{ flex: 1 }}>#{ch.name} <span className="user-handle">({ch.channel_type})</span>{ch.owner_only_posts && <span className="user-handle" title="Owner-only posting"> 🔒</span>}</span>
                  <label className="toggle-switch" title="Restrict posting to owner only" style={{ marginRight: 8 }}>
                    <input type="checkbox" checked={!!ch.owner_only_posts} onChange={() => toggleOwnerOnly(ch)} />
                    <span className="slider"></span>
                  </label>
                  <button className="icon-btn" onClick={() => moveChannel(i, -1)}>▲</button>
                  <button className="icon-btn" onClick={() => moveChannel(i, 1)}>▼</button>
                  <button className="link-btn" onClick={() => renameChannel(ch)}>Rename</button>
                  <button className="link-btn" onClick={() => delChannel(ch)} style={{ color: '#b00020' }}>Delete</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'danger' && (
            <div className="metro-anim">
              {!isOwner && <button className="btn btn-danger" onClick={leave}>Leave circle</button>}
              {isOwner && <>
                <p style={{ marginBottom: 12, color: 'var(--gplus-text-secondary)' }}>Owners can't leave — transfer ownership or delete the circle.</p>
                <button className="btn btn-danger" onClick={del}>Delete circle</button>
              </>}
            </div>
          )}
        </>
      );
    };

    const CircleView = ({ circleId, initialChannelId, onBack, onProfileClick, onChanged, onDeleted }) => {
      const ui = useUI();
      const toast = useToast();
      const [circle, setCircle] = useState(null);
      const [layout, setLayout] = useState({ channels: [], folders: [] });
      const [activeCh, setActiveCh] = useState(null);
      const [unread, setUnread] = useState({});
      const [loading, setLoading] = useState(true);
      const [railOpen, setRailOpen] = useState(false);

      const load = useCallback(async () => {
        setLoading(true);
        try {
          const [c, lay] = await Promise.all([api.getCircle(circleId), api.getLayout(circleId)]);
          setCircle(c); setLayout(lay);
          const chs = lay.channels || [];
          setActiveCh(prev => {
            // A deep link to a specific channel wins over the current
            // selection — otherwise a notification for another channel of
            // the already-open circle would be silently ignored.
            const wanted = initialChannelId && chs.find(x => x.id === initialChannelId);
            if (wanted) return wanted;
            return prev && chs.find(x => x.id === prev.id) ? prev : chs[0] || null;
          });
          api.getCircleUnread(circleId).then(r => setUnread(r.unread || {})).catch(() => { });
        } catch (e) { toast.error(e.message); }
        setLoading(false);
      }, [circleId, toast, initialChannelId]);

      useEffect(() => { load(); }, [load]);

      useEffect(() => {
        const cid = activeCh ? activeCh.id : null;
        if (cid) tellSw('context-focus', cid);
        return () => { if (cid) tellSw('context-blur', cid); };
      }, [activeCh ? activeCh.id : null]);

      const selectCh = (ch) => {
        setActiveCh(ch); setRailOpen(false);
        setUnread(u => ({ ...u, [ch.id]: { ...(u[ch.id] || {}), has_unread: false } }));
      };
      const readAll = async () => {
        const snap = unread;
        // Optimistic: clear the unread dots instantly.
        setUnread({});
        toast.show('Marked all read.');
        try { await api.circleReadAll(circleId); ui.refreshBadges(); }
        catch (e) {
          setUnread(snap);
          toast.error(e.message);
        }
      };
      const toggleMute = async () => {
        const snap = circle.muted;
        // Optimistic: flip the mute flag instantly.
        setCircle(c => ({ ...c, muted: !snap }));
        try {
          const r = await api.muteCircle(circleId);
          setCircle(c => ({ ...c, muted: r.muted }));
          toast.show(r.muted ? 'Muted.' : 'Unmuted.');
        } catch (e) {
          setCircle(c => ({ ...c, muted: snap }));
          toast.error(e.message);
        }
      };
      const togglePin = async () => {
        const snap = circle.is_pinned;
        // Optimistic: flip the pin flag instantly.
        setCircle(c => ({ ...c, is_pinned: !snap }));
        try {
          const r = await api.pinCircle(circleId);
          setCircle(c => ({ ...c, is_pinned: r.pinned }));
          toast.show(r.pinned ? 'Pinned.' : 'Unpinned.');
        } catch (e) {
          setCircle(c => ({ ...c, is_pinned: snap }));
          toast.error(e.message);
        }
      };

      if (loading) return <Spinner />;
      if (!circle) return <div className="empty-state">Circle unavailable.</div>;

      const grouped = layout.folders.map(f => ({ folder: f, channels: layout.channels.filter(c => c.folder_id === f.id) }));
      const noFolder = layout.channels.filter(c => !c.folder_id);

      const renderChannelItem = (ch) => (
        <div key={ch.id} className={`channel-item ${activeCh && activeCh.id === ch.id ? 'active' : ''}`} onClick={() => selectCh(ch)}>
          <span>{ch.channel_type === 'feed' ? '📰' : '#'} {ch.name}{ch.owner_only_posts && <span title="Owner-only posting"> 🔒</span>}</span>
          {unread[ch.id] && unread[ch.id].has_unread && <span className="unread-dot" />}
        </div>
      );

      return (
        <div className="chat-layout">
          <div className={`channel-rail ${railOpen ? 'open' : ''}`}>
            <div className="channel-rail-header">
              <button className="icon-btn" onClick={onBack}><I.Back /></button>
              <Avatar user={{ name: circle.name, photo_url: circle.icon_url }} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{circle.name}</div>
                <div className="user-handle">{circle.member_count} members</div>
              </div>
              <button className="icon-btn" onClick={() => ui.openModal({
                render: (close) => (
                  <CircleSettings circle={circle} onClose={close} onChanged={(c) => { setCircle(prev => ({ ...prev, ...c })); onChanged && onChanged(c); load(); }} onDeleted={(id) => { onDeleted && onDeleted(id); onBack(); }} onLeft={(id) => { onDeleted && onDeleted(id); onBack(); }} />
                )
              })}><I.Settings /></button>
            </div>

            {circle.banner_url && (
              <div style={{ height: 80, backgroundImage: `url(${circle.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center', borderBottom: '1px solid var(--gplus-border)' }} />
            )}

            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--gplus-border)' }}>
              <button className="btn btn-outline btn-sm" onClick={readAll}>Read all</button>
              <button className="btn btn-outline btn-sm" onClick={toggleMute}>{circle.muted ? 'Unmute' : 'Mute'}</button>
              <button className={`btn btn-sm ${circle.is_pinned ? '' : 'btn-outline'}`} onClick={togglePin}>{circle.is_pinned ? 'Unpin' : 'Pin'}</button>
            </div>
            <div className="channel-list metro-stagger">
              {grouped.map(g => (
                <div key={g.folder.id}>
                  <div className="folder-label">{g.folder.name}</div>
                  {g.channels.map(renderChannelItem)}
                </div>
              ))}
              {noFolder.length > 0 && grouped.length > 0 && <div className="folder-label">Channels</div>}
              {noFolder.map(renderChannelItem)}
              {layout.channels.length === 0 && <div className="empty-state">No channels yet.</div>}
            </div>
          </div>

          {activeCh ? (
            activeCh.channel_type === 'feed'
              ? <ChannelFeed channelId={activeCh.id} channelName={activeCh.name} canPost={!activeCh.owner_only_posts || circle.is_owner} onProfileClick={onProfileClick} />
              : <ChatView channelId={activeCh.id} channelName={activeCh.name} channelDesc={activeCh.description} canModerate={circle.is_owner} canPost={!activeCh.owner_only_posts || circle.is_owner} onProfileClick={onProfileClick}
                headerExtra={<button className="icon-btn rail-toggle" onClick={() => setRailOpen(o => !o)}><I.Menu /></button>} />
          ) : <div className="chat-main"><div className="empty-state">Select a channel.</div></div>}
        </div>
      );
    };

export { CircleSettings, CircleView };
