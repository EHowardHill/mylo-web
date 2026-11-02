// src/discover.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useToast, useUI } from './contexts.js';
import { Avatar, Spinner } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const CircleListCard = ({ circle, onOpen, action }) => (
      <div className="card list-row" onClick={onOpen}>
        <Avatar user={{ name: circle.name, photo_url: circle.icon_url }} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">{circle.name}</div>
          <div className="user-handle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {circle.description ? circle.description : `${circle.member_count || 0} members`}
          </div>
        </div>
        {action}
      </div>
    );

    const CreateCircleModal = ({ onClose, onCreated }) => {
      const toast = useToast();
      const [name, setName] = useState('');
      const [isPublic, setIsPublic] = useState(false);
      const [busy, setBusy] = useState(false);

      const create = async () => {
        if (!name.trim()) { toast.error('Give your circle a name.'); return; }
        setBusy(true);
        try {
          const res = await api.createCircle({ name: name.trim(), is_public: isPublic });
          const circle = res.circle || res;
          toast.show('Circle created.');
          onCreated && onCreated(circle);
          onClose();
        } catch (e) { toast.error(e.message); setBusy(false); }
      };

      return (
        <div>
          <div className="form-group">
            <label>Name</label>
            <input className="form-input" autoFocus value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="e.g. Weekend Hikers" />
          </div>
          <div className="settings-row" style={{ padding: '8px 0' }}>
            <div><div>Public</div><div className="user-handle">Anyone can discover and join</div></div>
            <label className="toggle-switch">
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
          </div>
        </div>
      );
    };

    const DiscoverPage = ({ onOpenCircle, loadMine }) => {
      const ui = useUI();
      const toast = useToast();
      const [discover, setDiscover] = useState([]);
      const [loadingDisc, setLoadingDisc] = useState(true);
      const [inviteCode, setInviteCode] = useState('');

      const loadDiscover = useCallback(async () => {
        setLoadingDisc(true);
        try { setDiscover(await api.discoverCircles() || []); }
        catch (e) { toast.error(e.message); }
        setLoadingDisc(false);
      }, [toast]);

      useEffect(() => { loadDiscover(); }, [loadDiscover]);

      const joinByCode = async () => {
        const code = inviteCode.trim();
        if (!code) return;
        try {
          const prev = await api.previewInvite(code);
          ui.openModal({
            title: 'Join circle', render: (close) => (
              <div>
                <div className="list-row" style={{ borderBottom: 'none' }}>
                  <Avatar user={{ name: prev.circle.name, photo_url: prev.circle.icon_url }} size={48} />
                  <div><div className="user-name">{prev.circle.name}</div><div className="user-handle">{prev.circle.member_count} members</div></div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={close}>Cancel</button>
                  <button className="btn" onClick={async () => {
                    // Optimistic: close the modal and toast immediately;
                    // loadMine/onOpenCircle reconcile the sidebar afterwards.
                    close(); setInviteCode(''); toast.show('Joined!');
                    try {
                      const r = await api.joinCircle(code);
                      await loadMine();
                      // Guard the response shape (joinPublic does the same);
                      // fall back to the id we already know from the preview.
                      onOpenCircle((r.circle && r.circle.id) || (prev.circle && prev.circle.id));
                    }
                    catch (e) { toast.error(e.message); }
                  }}>Join</button>
                </div>
              </div>
            )
          });
        } catch (e) { toast.error(e.message); }
      };

      const joinPublic = async (c) => {
        // Optimistic: remove the card from Discover instantly.
        setDiscover(d => d.filter(x => x.id !== c.id));
        toast.show('Joined!');
        try {
          const r = await api.joinCircle(c.invite_code);
          await loadMine();
          onOpenCircle((r.circle && r.circle.id) || c.id);
        } catch (e) {
          // Re-show only this card if joining failed — a stale whole-list
          // snapshot here could resurrect circles joined in the meantime.
          setDiscover(d => d.some(x => x.id === c.id) ? d : [c, ...d]);
          toast.error(e.message);
        }
      };

      return (
        <div className="feed-container metro-stagger">
          <div className="list-header">
            <h2>Discover Circles</h2>
          </div>

          <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="Enter invite code…" value={inviteCode} onChange={e => setInviteCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinByCode()} />
            <button className="btn btn-outline" onClick={joinByCode}>Join</button>
          </div>

          {loadingDisc ? <Spinner /> : (
            discover.length === 0 ? <div className="card empty-state">No public circles to discover.</div>
              : discover.map(c => <CircleListCard key={c.id} circle={c} onOpen={() => onOpenCircle(c.id)} action={<button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); joinPublic(c); }}>Join</button>} />)
          )}
        </div>
      );
    };

export { CircleListCard, CreateCircleModal, DiscoverPage };
