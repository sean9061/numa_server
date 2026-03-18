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
        <BentoCard title="Hobbies" className={className} delay={1.2}>
            <div className="flex h-full w-full flex-col gap-2 md:flex-row">
                {siteConfig.interests.hobbies.map((hobby) => (
                    <motion.div
                        layout
                        key={hobby.name}
                        onHoverStart={() => setHovered(hobby.name)}
                        onHoverEnd={() => setHovered(null)}
                        className={cn(
                            "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-neutral-100 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700",
                            "h-[60px] md:h-full w-full md:w-auto",
                            hovered === hobby.name ? "md:flex-[3]" : "md:flex-[1]"
                        )}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        <div className="flex flex-col items-center justify-center p-4">
                            <motion.div
                                layout
                                className={cn(
                                    "flex items-center justify-center rounded-full transition-colors duration-300",
                                    hovered === hobby.name 
                                        ? "mb-2 h-12 w-12 bg-white shadow-sm dark:bg-neutral-900" 
                                        : "h-6 w-6"
                                )}
                            >
                                <hobby.icon 
                                    className={cn(
                                        "h-6 w-6 transition-colors duration-300",
                                        hovered === hobby.name ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                                    )} 
                                />
                            </motion.div>
                            
                            {hovered === hobby.name && (
                                <motion.h4
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-lg font-bold text-neutral-900 dark:text-white whitespace-nowrap"
                                >
                                    {hobby.name}
                                </motion.h4>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </BentoCard>
    );
}
