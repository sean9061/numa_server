"use client";

import { useState } from "react";
import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function InterestsCard({ className }: { className?: string }) {
    const [hovered, setHovered] = useState<string | null>(null);

    return (
        <BentoCard title="Hobbies" className={className} delay={0.4}>
            <div className="flex h-full w-full flex-col gap-2 md:flex-row">
                {siteConfig.interests.hobbies.map((hobby) => (
                    <motion.div
                        layout
                        key={hobby.name}
                        onHoverStart={() => setHovered(hobby.name)}
                        onHoverEnd={() => setHovered(null)}
                        className={cn(
                            "relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-neutral-100 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700",
                            // On mobile (flex-col), we might want a different behavior or just standard list
                            "h-[60px] md:h-full w-full md:w-auto",
                            // Flex grow logic for desktop
                            hovered === hobby.name ? "md:flex-[3]" : "md:flex-[1]"
                        )}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        {/* Icon - Visible only when NOT expanded (for desktop) */}
                        <div className={cn(
                            "flex h-full w-full items-center justify-center p-4",
                            hovered === hobby.name ? "hidden" : "flex"
                        )}>
                            <hobby.icon className="h-6 w-6 text-neutral-500 dark:text-neutral-400" />
                        </div>

                        {/* Expanded Content */}
                        <motion.div
                            className={cn(
                                "absolute inset-0 flex flex-col items-center justify-center p-4 text-center",
                                hovered === hobby.name ? "opacity-100" : "opacity-0"
                            )}
                            initial={false}
                            animate={{ opacity: hovered === hobby.name ? 1 : 0 }}
                        >
                            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm dark:bg-neutral-900">
                                <hobby.icon className="h-6 w-6 text-neutral-900 dark:text-white" />
                            </div>
                            <motion.h4
                                layoutId={`title-${hobby.name}`}
                                className="text-lg font-bold text-neutral-900 dark:text-white"
                            >
                                {hobby.name}
                            </motion.h4>
                        </motion.div>
                    </motion.div>
                ))}
            </div>
        </BentoCard>
    );
}
