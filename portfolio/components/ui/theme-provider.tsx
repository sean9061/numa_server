"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
    theme: Theme;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark",
    toggle: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

function getInitialTheme(): Theme {
    if (typeof window === "undefined") return "dark";
    const stored = sessionStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
    }, [theme]);

    // sessionStorage 未設定のときだけシステム設定変化を追従
    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onSystemChange = (e: MediaQueryListEvent) => {
            if (!sessionStorage.getItem("theme")) {
                setTheme(e.matches ? "dark" : "light");
            }
        };
        mq.addEventListener("change", onSystemChange);
        return () => mq.removeEventListener("change", onSystemChange);
    }, []);

    const toggle = () => {
        setTheme(t => {
            const next = t === "dark" ? "light" : "dark";
            sessionStorage.setItem("theme", next);
            return next;
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}
