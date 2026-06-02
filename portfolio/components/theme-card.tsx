"use client";

import { BentoCard } from "@/components/ui/bento-card";
import { useTheme } from "@/components/ui/theme-provider";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeCard() {
    const { theme, toggle } = useTheme();

    return (
        <BentoCard className="w-1/4 aspect-square p-0" delay={0.6}>
            <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="group flex flex-1 w-full items-center justify-center"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {theme === "dark" ? (
                        <motion.div
                            key="sun"
                            initial={{ rotate: -45, opacity: 0, scale: 0.7 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: 45, opacity: 0, scale: 0.7 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Sun className="h-6 w-6 text-neutral-400 transition-colors group-hover:text-amber-400" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="moon"
                            initial={{ rotate: 45, opacity: 0, scale: 0.7 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: -45, opacity: 0, scale: 0.7 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Moon className="h-6 w-6 text-neutral-400 transition-colors group-hover:text-indigo-400" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>
        </BentoCard>
    );
}
