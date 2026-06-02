"use client";

import { useState } from "react";
import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { useTheme } from "@/components/ui/theme-provider";
import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function InterestsCard({ className }: { className?: string }) {
    const { theme } = useTheme();
    const [active, setActive] = useState<string | null>(null);
    const brightDefault = theme === "dark" ? "blur(4px) brightness(0.5)" : "blur(4px) brightness(0.82)";
    const brightActive  = theme === "dark" ? "blur(0px) brightness(0.7)" : "blur(0px) brightness(1.0)";

    return (
        <BentoCard title="Hobbies" className={className} delay={1.2}>
            <div className="flex h-full w-full flex-col gap-2 md:flex-row">
                {siteConfig.interests.hobbies.map((hobby) => (
                    <div
                        key={hobby.name}
                        onPointerEnter={(e) => { if (e.pointerType === "mouse") setActive(hobby.name); }}
                        onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
                        onClick={() => setActive(prev => prev === hobby.name ? null : hobby.name)}
                        className="relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800 w-full md:w-auto"
                        style={{
                            flexGrow: active === hobby.name ? 3 : 1,
                            flexShrink: 1,
                            flexBasis: 0,
                            minHeight: active === hobby.name ? "160px" : "64px",
                            transition: "flex-grow 0.3s ease-in-out, min-height 0.3s ease-in-out",
                        }}
                    >
                        {/* Background image — fixed min-width so narrow flex state doesn't compress it */}
                        {hobby.image && (
                            <div
                                className="absolute top-0 bottom-0 bg-cover bg-center"
                                style={{
                                    left: "50%",
                                    width: "400px",
                                    transform: "translateX(-50%)",
                                    backgroundImage: `url(${hobby.image})`,
                                    filter: active === hobby.name ? brightActive : brightDefault,
                                    transition: "filter 0.5s ease",
                                    willChange: "filter",
                                }}
                            />
                        )}

                        <div className="relative z-10 flex flex-col items-center justify-center p-4">
                            <div
                                className={cn(
                                    "flex items-center justify-center rounded-full",
                                    active === hobby.name
                                        ? "mb-2 h-12 w-12 bg-white/20 shadow-sm backdrop-blur-sm"
                                        : "h-6 w-6"
                                )}
                            >
                                <hobby.icon
                                    className="h-6 w-6 text-white drop-shadow"
                                />
                            </div>

                            {active === hobby.name && (
                                <motion.h4
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-lg font-bold text-white whitespace-nowrap drop-shadow"
                                >
                                    {hobby.name}
                                </motion.h4>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </BentoCard>
    );
}
