// src/contexts.js — extracted verbatim from the original single-file app. Body is unchanged.
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const AuthContext = createContext(null);
    const useAuth = () => useContext(AuthContext);
    const ToastContext = createContext(null);
    const useToast = () => useContext(ToastContext);
    const UIContext = createContext(null);
    const useUI = () => useContext(UIContext);

export { AuthContext, useAuth, ToastContext, useToast, UIContext, useUI };
