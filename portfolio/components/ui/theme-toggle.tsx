"use client";

import { useTheme } from "./theme-provider";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
    const { theme, toggle } = useTheme();

    return (
        <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="fixed top-4 right-10 z-[9990] flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/80 text-neutral-600 shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
            <AnimatePresence mode="wait" initial={false}>
                {theme === "dark" ? (
                    <motion.span
                        key="sun"
                        initial={{ rotate: -45, opacity: 0, scale: 0.7 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: 45, opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.18 }}
                    >
                        <Sun className="h-4 w-4" />
                    </motion.span>
                ) : (
                    <motion.span
                        key="moon"
                        initial={{ rotate: 45, opacity: 0, scale: 0.7 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        exit={{ rotate: -45, opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.18 }}
                    >
                        <Moon className="h-4 w-4" />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );
}
