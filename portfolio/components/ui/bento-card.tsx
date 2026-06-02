"use client";

import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useContentVisible, STAGE1_DUR, SYNC_T } from "./loading-provider";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface BentoCardProps {
    children: ReactNode;
    className?: string;
    title?: string;
    delay?: number;
}

const Y_START = 60;
const Y_MID   = 14;

export function BentoCard({ children, className, title, delay = 0 }: BentoCardProps) {
    const contentVisible = useContentVisible();
    const [phase, setPhase] = useState<0 | 1 | 2>(0);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), delay * 1000);
        const t2 = setTimeout(() => setPhase(2), SYNC_T * 1000);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const yVal    = phase === 2 ? 0 : phase === 1 ? Y_MID : Y_START;
    const opacity = phase === 0 ? 0 : 1;

    let cssTransition: string;
    if (phase === 0) {
        cssTransition = "none";
    } else if (phase === 1) {
        cssTransition = `transform ${STAGE1_DUR}s linear, opacity 0.25s linear`;
    } else {
        cssTransition = "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)";
    }

    const colorCls = contentVisible
        ? "bg-white dark:bg-neutral-900 border-transparent dark:border-transparent"
        : "bg-neutral-50 dark:bg-[#111111] border-blue-100 dark:border-neutral-700";

    return (
        <div
            ref={ref}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-3xl p-6 shadow-card hover:shadow-card-hover border",
                colorCls,
                className
            )}
            style={{
                transform: `translateY(${yVal}px)`,
                opacity,
                transition: cssTransition + ", background-color 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease",
            }}
        >
            {/* Border sweep */}
            <div className="pointer-events-none absolute inset-0">
                <motion.div
                    className="absolute left-1/2 top-1/2"
                    style={{
                        width: "200%",
                        height: "200%",
                        translateX: "-50%",
                        translateY: "-50%",
                        background:
                            "conic-gradient(from -45deg, transparent 0deg, rgba(255,255,255,0.3) 2deg, white 5deg, rgba(255,255,255,0.3) 8deg, transparent 11deg, transparent 360deg)",
                        filter: "blur(1px)",
                    }}
                    initial={{ rotate: 0, opacity: 0 }}
                    animate={{ rotate: 360, opacity: [0, 1, 1, 0] }}
                    transition={{
                        rotate:  { duration: 0.5, delay: delay + 0.15, ease: "linear" },
                        opacity: { duration: 0.6, delay: delay + 0.15, times: [0, 0.01, 0.88, 1] },
                    }}
                />
                <div
                    className={cn(
                        "absolute inset-[1.5px] rounded-[22.5px]",
                        contentVisible ? "bg-white dark:bg-neutral-900" : "bg-neutral-50 dark:bg-[#111111]"
                    )}
                    style={{ transition: "background-color 0.5s ease" }}
                />
            </div>

            {/* Content */}
            <motion.div
                className="relative z-10 flex flex-col flex-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: contentVisible ? 1 : 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
            >
                {title && (
                    <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        {title}
                    </h3>
                )}
                <div className="flex flex-col flex-1">{children}</div>
            </motion.div>
        </div>
    );
}
