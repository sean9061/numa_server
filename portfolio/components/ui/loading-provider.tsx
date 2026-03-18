"use client";

import { createContext, useContext, useEffect, useState } from "react";

// ---- タイミング定数（bento-card.tsx と共有） ----
export const STAGE1_DUR = 0.6;   // 個別上昇の時間 (s)
export const LAST_DELAY = 1.2;   // 最後のカードの delay (s)
export const STAGE2_DUR = 0.1;  // 一斉着地の時間 (s)
export const SYNC_T     = LAST_DELAY + STAGE1_DUR; // 全カードが揃う絶対時刻 (1.3s)

const CONTENT_REVEAL_MS = Math.round((SYNC_T + STAGE2_DUR + 0.0) * 1000); // 1750ms

const LoadingContext = createContext(false);

export function useContentVisible() {
    return useContext(LoadingContext);
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
    const [contentVisible, setContentVisible] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setContentVisible(true), CONTENT_REVEAL_MS);
        return () => clearTimeout(t);
    }, []);

    return (
        <LoadingContext.Provider value={contentVisible}>
            {children}
        </LoadingContext.Provider>
    );
}
