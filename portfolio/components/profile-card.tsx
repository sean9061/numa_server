"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { useTheme } from "@/components/ui/theme-provider";
import { MapPin, Building2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

const themeColors: Record<string, string> = {
    GitHub:    "#6e40c9",
    X:         "#e7e9ea",
    Instagram: "#E4405F",
    Zenn:      "#3EA8FF",
};

export function ProfileCard({ className }: { className?: string }) {
    const { theme } = useTheme();
    const dark = theme === "dark";
    const [hovered, setHovered] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const update = () => setIsMobile(window.innerWidth < 640);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    return (
        <BentoCard className={className} delay={0}>
            <div className="flex h-full gap-4">
                {/* Left: main content */}
                <div className="flex flex-1 flex-col justify-between gap-4">
                    {/* Avatar */}
                    <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-neutral-100 dark:border-neutral-800">
                        <div className="absolute inset-0 bg-neutral-200 dark:bg-neutral-800" />
                        <Image
                            src={siteConfig.avatar}
                            alt={siteConfig.name}
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>

                    {/* Names */}
                    <div>
                        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                            {siteConfig.name}
                        </h1>
                        {/* @ts-ignore */}
                        <p className="text-lg font-medium text-neutral-500 dark:text-neutral-400">
                            {siteConfig.nameJa}
                        </p>
                    </div>

                    {/* Details: Location & Affiliation */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                            <MapPin className="h-4 w-4" />
                            <a
                                href="https://eyes.nasa.gov/apps/solar-system/#/earth"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                            >
                                {siteConfig.location}
                            </a>
                        </div>
                        {/* @ts-ignore */}
                        <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-200">
                            <Building2 className="h-4 w-4 text-neutral-500" />
                            <span>{siteConfig.affiliation}</span>
                        </div>
                    </div>
                </div>

                {/* Right: social icons */}
                <div className="flex flex-col items-end justify-between gap-3 py-1">
                    {siteConfig.socials.map((social) => {
                        const baseColor = themeColors[social.name] ?? "#888888";
                        // X の #e7e9ea はライト背景で消えるため濃い色に差し替え
                        const color = !dark && social.name === "X" ? "#1a1a1a" : baseColor;
                        const isHovered = hovered === social.name;
                        return (
                            <Link
                                key={social.name}
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={social.name}
                                className="flex h-13 flex-row items-center overflow-hidden rounded-full transition-all duration-300"
                                style={{
                                    width: isMobile ? "52px" : "130px",
                                    background: isHovered
                                        ? `linear-gradient(to top, ${color}${dark ? "45" : "55"} 0%, ${color}${dark ? "10" : "18"} 50%, transparent 100%)`
                                        : `linear-gradient(to top, ${color}${dark ? "22" : "38"} 0%, ${color}${dark ? "05" : "10"} 50%, transparent 100%)`,
                                    boxShadow: isHovered
                                        ? `inset 0 -1px 5px 0 ${color}${dark ? "50" : "70"}`
                                        : `inset 0 -1px 6px 0 ${color}${dark ? "28" : "50"}`,
                                    color: isHovered ? color : dark ? "rgba(160,160,160,0.9)" : "rgba(80,80,80,0.85)",
                                }}
                                onMouseEnter={() => setHovered(social.name)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <div className="flex h-13 w-13 shrink-0 items-center justify-center">
                                    <social.icon className="h-5 w-5 transition-colors duration-200" />
                                </div>
                                {!isMobile && (
                                    <span className="whitespace-nowrap pr-3 text-sm font-medium">
                                        {social.name}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </BentoCard>
    );
}
