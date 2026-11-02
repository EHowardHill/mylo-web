// src/shell.js — extracted verbatim from the original single-file app. Body is unchanged.
import { useAuth, useUI } from './contexts.js';
import { CreateCircleModal } from './discover.js';
import { I } from './icons.js';
import { ComposeModal } from './posts.js';
import { Avatar, Modal } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const Sidebar = ({ page, activeCircle, onNavigate, isOpen, close, badges, myCircles, unreadCircles, onOpenCircle, loadMyCircles, onResizeStart }) => {
      const auth = useAuth();
      const ui = useUI();

      const item = (key, icon, label, badge) => (
        <div className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => { onNavigate(key); close(); }}>
          {icon} {label}
          {badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
        </div>
      );

      const sortedCircles = useMemo(() => {
        return myCircles.slice()
          .map(c => {
            const u = unreadCircles && unreadCircles[c.id];
            const score = (u ? 3 : 0) + (c.is_pinned ? 2 : 0);
            return { c, u, score };
          })
          .sort((a, b) => b.score - a.score);
      }, [myCircles, unreadCircles]);

      return (
        <div className={`sidebar ${isOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="logo"><img src="https://cinemint.online/mylo/mylogo.png" alt="Mylo" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div>
              {item('home', <I.Home />, 'Home')}
              {item('dm', <I.DM />, 'Messages', badges.dm)}
              {item('notifications', <I.Bell />, 'Notifications', badges.notifications)}
              {item('members', <I.People />, 'Members')}
              {item('settings', <I.Settings />, 'Settings')}
            </div>

            <div style={{ padding: '16px 24px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--gplus-text-secondary)', fontSize: 14, textTransform: 'lowercase' }}>
              <span>circles</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" style={{ padding: 4 }} title="Discover / Join" onClick={() => { onNavigate('discover'); close(); }}><I.Search /></button>
                <button className="icon-btn" style={{ padding: 4 }} title="Create Circle" onClick={() => { ui.openModal({ title: 'Create circle', render: (c) => <CreateCircleModal onClose={c} onCreated={async (circle) => { await loadMyCircles(); onOpenCircle(circle.id); }} /> }); close(); }}><I.Plus /></button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sortedCircles.map(({ c, u }) => (
                <div key={c.id} className={`nav-item ${page === 'circle' && activeCircle === c.id ? 'active' : ''} ${u && u.has_unread ? 'has-unread' : ''}`} onClick={() => { onOpenCircle(c.id); close(); }}>
                  <Avatar user={{ name: c.name, photo_url: c.icon_url }} size={24} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: (u && u.has_unread) ? 'bold' : 'normal' }}>{c.name}</span>
                  {c.is_pinned && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--gplus-text-secondary)' }}><I.Pin /></span>}
                  {u && u.has_unread && <span className="circle-unread-badge"></span>}
                </div>
              ))}
              {myCircles.length === 0 && <div style={{ padding: '12px 24px', color: 'var(--gplus-text-secondary)', fontSize: 13 }}>No circles yet.</div>}
            </div>
          </div>

          <div className="sidebar-footer" style={{ cursor: 'pointer' }} onClick={() => { onNavigate('profile'); close(); }}>
            <Avatar user={auth.user} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.user.name}</div>
              <div className="user-handle">+{auth.user.handle}</div>
            </div>
          </div>

          <div className="sidebar-resize-handle" onMouseDown={onResizeStart} title="Drag to resize" />
        </div>
      );
    };

    const TopBar = ({ onMenu }) => (
      <div className="topbar">
        <button className="icon-btn rail-toggle" style={{ display: 'flex', marginRight: 12 }} onClick={onMenu}><I.Menu /></button>
      </div>
    );

    const ToastHost = ({ toasts }) => (
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>{t.message}</div>)}
      </div>
    );

    const LightboxHost = ({ src, onClose }) => {
      if (!src) return null;
      return (
        <div className="lightbox" onClick={onClose}>
          <button className="icon-btn lightbox-close" onClick={onClose}><I.Close /></button>
          <img src={src} alt="" onClick={e => e.stopPropagation()} />
        </div>
      );
    };

    const ModalHost = ({ modals, onClose }) => (
      <>
        {modals.map((m, i) => (
          <Modal key={m.id} title={m.title} wide={m.wide} onClose={() => onClose(m.id)}>
            {m.render(() => onClose(m.id))}
          </Modal>
        ))}
      </>
    );

    const ComposeHost = ({ compose, onClose }) => {
      if (!compose) return null;
      return <ComposeModal reshare={compose.reshare} defaultChannelId={compose.defaultChannelId} onClose={onClose}
        onCreated={() => { onClose(); compose.onCreated && compose.onCreated(); }} />;
    };

export { Sidebar, TopBar, ToastHost, LightboxHost, ModalHost, ComposeHost };
