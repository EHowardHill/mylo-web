// src/hooks.js — extracted verbatim from the original single-file app. Body is unchanged.
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    /* ============================ OPTIMISTIC UI HELPERS ============================ */
    // Temp id for optimistically inserted items (comments, messages, channels…).
    // Replaced by the server's real id when the response is reconciled.
    const tmpId = () => 'tmp_' + ((crypto.randomUUID && crypto.randomUUID())
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Ref that flips to false on unmount, so late-arriving responses from
    // optimistic requests never setState on a dead component.
    const useIsMounted = () => {
      const ref = useRef(true);
      useEffect(() => () => { ref.current = false; }, []);
      return ref;
    };

    // Per-target last-write-wins guard for spam-tappable toggles (+1, follow…):
    // bump the sequence on every tap, and only reconcile/rollback the response
    // carrying the latest sequence for that target.
    const useSeq = () => {
      const ref = useRef({});
      return (key) => {
        const my = (ref.current[key] || 0) + 1;
        ref.current[key] = my;
        return { isCurrent: () => my === ref.current[key] };
      };
    };

    // Close-on-outside-tap for popovers (post menu, emoji picker…) so they can
    // also be dismissed on touch devices, where onMouseLeave never fires.
    const useOutsideClose = (open, onClose) => {
      const ref = useRef(null);
      useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
          if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
      }, [open, onClose]);
      return ref;
    };

export { tmpId, useIsMounted, useSeq, useOutsideClose };
