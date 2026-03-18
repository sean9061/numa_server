"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";

const themeColors: Record<string, { light: string; dark: string }> = {
    GitHub:    { light: "#6e40c9", dark: "#6e40c9" },
    X:         { light: "#000000", dark: "#e7e9ea" },
    Instagram: { light: "#E4405F", dark: "#E4405F" },
    Zenn:      { light: "#3EA8FF", dark: "#3EA8FF" },
};

export function SocialLinksCard({ className }: { className?: string }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        setIsDark(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    return (
        <BentoCard title="Connect" className={className} delay={0.6}>
            <div className="flex flex-col flex-1 gap-2 min-h-0">
                {siteConfig.socials.map((social) => {
                    const palette = themeColors[social.name] ?? { light: "#888888", dark: "#888888" };
                    const color = isDark ? palette.dark : palette.light;
                    const isHovered = hovered === social.name;

                    return (
                        <Link
                            key={social.name}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-1 items-center justify-between rounded-xl px-4 transition-colors duration-200 dark:bg-neutral-800/50"
                            style={{
                                backgroundColor: isHovered ? `${color}18` : undefined,
                                border: `1px solid ${isHovered ? color + "55" : "transparent"}`,
                            }}
                            onMouseEnter={() => setHovered(social.name)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className="flex items-center gap-3">
                                <social.icon
                                    className="h-5 w-5 transition-colors duration-200"
                                    style={{ color: isHovered ? color : undefined }}
                                />
                                <span
                                    className="font-medium text-neutral-900 dark:text-white transition-colors duration-200"
                                    style={{ color: isHovered ? color : undefined }}
                                >
                                    {social.name}
                                </span>
                            </div>
                            <ArrowUpRight
                                className="h-4 w-4 transition-all duration-200"
                                style={{
                                    color: isHovered ? color : "#a3a3a3",
                                    transform: isHovered ? "translate(2px,-2px)" : undefined,
                                }}
                            />
                        </Link>
                    );
                })}
            </div>
        </BentoCard>
    );
}
