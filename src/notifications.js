// src/notifications.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useToast, useUI } from './contexts.js';
import { openPostModal } from './deeplink.js';
import { Spinner } from './ui.js';
import { timeAgo } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    async function openNotificationNav(n, ui, toast, onProfileClick) {
      const targetType = n.target_type;
      const targetId = n.target_id;

      if (targetType === 'post' && targetId) {
        return await openPostModal(targetId, ui, toast, onProfileClick);
      }

      if (targetType === 'channel' && targetId && n.circle_id) {
        ui.goCircle(n.circle_id, targetId);
        return true;
      }

      const handle = (n.source_user && n.source_user.handle) || n.source_handle;
      if (handle) {
        onProfileClick(handle);
        return true;
      }

      const link = n.link || n.href;
      if (link) {
        if (/^https?:\/\//.test(link)) window.open(link, '_blank', 'noopener');
        else window.location.href = link;
        return true;
      }

      toast.show('Nothing to open for this notification.');
      return false;
    }

    const Notifications = ({ onProfileClick }) => {
      const ui = useUI();
      const toast = useToast();
      const [items, setItems] = useState([]);
      const [loading, setLoading] = useState(true);
      const markReadCalled = useRef(false);

      useEffect(() => {
        (async () => {
          try {
            const res = await api.getNotifications();
            setItems(res || []);
            if (!markReadCalled.current && res && res.length > 0) {
              markReadCalled.current = true;
              // Optimistic: sync the badges immediately (the server-side
              // mark-read runs in the background and re-syncs on completion).
              ui.refreshBadges();
              setTimeout(() => {
                api.markNotificationsRead().then(() => ui.refreshBadges()).catch(() => { });
              }, 1500);
            }
          } catch (e) { toast.error(e.message); }
          setLoading(false);
        })();
      }, [toast]);

      const openNotification = async (n) => {
        // Visually mark this one as read immediately
        setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        await openNotificationNav(n, ui, toast, onProfileClick);
      };

      if (loading) return <Spinner />;
      return (
        <div className="feed-container metro-stagger">
          {items.length === 0 ? <div className="card empty-state">No notifications.</div> :
            items.map(n => (
              <div
                key={n.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => openNotification(n)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotification(n); } }}
                style={{
                  padding: 16, display: 'flex', gap: 12, alignItems: 'center',
                  opacity: n.is_read ? 0.7 : 1, cursor: 'pointer',
                }}
              >
                {(n.icon_url || (n.source_user && n.source_user.photo_url)) && (
                  <img
                    src={n.icon_url || n.source_user.photo_url}
                    className="avatar"
                    style={{ width: 40, height: 40 }}
                    alt=""
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{n.title}</div>
                  <div style={{ color: 'var(--gplus-text-secondary)', fontSize: 14 }}>{n.body}</div>
                  {n.image_url && (
                    <img
                      src={n.image_url}
                      alt=""
                      style={{ marginTop: 8, maxWidth: 200, borderRadius: 0, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); ui.openLightbox(n.image_url); }}
                    />
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gplus-text-secondary)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <span style={{ width: 10, height: 10, background: 'var(--gplus-red)', flexShrink: 0 }} />
                )}
              </div>
            ))}
        </div>
      );
    };

export { openNotificationNav, Notifications };
