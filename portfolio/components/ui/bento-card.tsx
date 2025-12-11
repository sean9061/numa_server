"use client";

import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ReactNode } from "react";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface BentoCardProps {
    children: ReactNode;
    className?: string;
    title?: string;
    delay?: number;
}

export function BentoCard({ children, className, title, delay = 0 }: BentoCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-neutral-900 dark:border dark:border-neutral-800",
                className
            )}
        >
            {title && (
                <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {title}
                </h3>
            )}
            <div className="flex-1">{children}</div>
        </motion.div>
    );
}
