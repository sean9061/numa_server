"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { motion } from "framer-motion";
import { useState } from "react";
import {
    Atom,
    Zap,
    FileCode,
    Palette,
    Container,
    Layout,
    Database,
    Globe,
    Server
} from "lucide-react";

const iconMap: Record<string, any> = {
    react: Atom,
    nextjs: Zap,
    typescript: FileCode,
    tailwindcss: Palette,
    framermotion: Layout,
    docker: Container,
    database: Database,
    web: Globe,
    server: Server,
};

export function TechStackCard({ className }: { className?: string }) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Helper to ensure hydration consistency
    const toFixed = (n: number) => parseFloat(n.toFixed(2));

    // Calculate default positions for all items once
    const positions = siteConfig.techStack.map((_, i) => {
        const count = siteConfig.techStack.length;
        if (count <= 4) {
            const r = 50;
            const theta = (i / count) * 2 * Math.PI;
            return { x: toFixed(r * Math.cos(theta)), y: toFixed(r * Math.sin(theta)) };
        } else {
            const innerCount = 3;
            const outerCount = count - innerCount;
            if (i < innerCount) {
                const r = 35;
                const theta = (i / innerCount) * 2 * Math.PI;
                return { x: toFixed(r * Math.cos(theta)), y: toFixed(r * Math.sin(theta)) };
            } else {
                const r = 75;
                const indexInOuter = i - innerCount;
                const theta = (indexInOuter / outerCount) * 2 * Math.PI + (Math.PI / outerCount);
                return { x: toFixed(r * Math.cos(theta)), y: toFixed(r * Math.sin(theta)) };
            }
        }
    });

    return (
        <BentoCard title="Tech Stack" className={className} delay={0.3}>
            <div className="flex h-full w-full items-center justify-center p-4">
                <div
                    className="relative flex aspect-square w-full max-w-[220px] items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {siteConfig.techStack.map((tech, i) => {
                        const Icon = iconMap[tech.icon] || Globe;
                        const isHovered = hoveredIndex === i;
                        const isSomethingHovered = hoveredIndex !== null;
                        const defaultPos = positions[i];

                        // Determine target state
                        let targetX = defaultPos.x;
                        let targetY = defaultPos.y;
                        let targetScale = 1;
                        let zIndex = 1;

                        if (isSomethingHovered) {
                            if (isHovered) {
                                // Hovered item stays in place but grows
                                targetScale = 2;
                                zIndex = 50;
                            } else if (hoveredIndex !== null) {
                                // Repulsion logic
                                const hoveredPos = positions[hoveredIndex];
                                const dx = defaultPos.x - hoveredPos.x;
                                const dy = defaultPos.y - hoveredPos.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                // Push away if close
                                if (dist < 80) { // Threshold for repulsion
                                    const force = (80 - dist) * 0.8;
                                    const angle = Math.atan2(dy, dx);
                                    targetX += force * Math.cos(angle);
                                    targetY += force * Math.sin(angle);
                                }

                                targetScale = 0.5;
                                zIndex = 1;
                            }
                        }

                        return (
                            <motion.div
                                key={tech.name}
                                className="absolute group/icon flex items-center justify-center"
                                style={{ zIndex }}
                                animate={{
                                    x: targetX,
                                    y: targetY,
                                    scale: targetScale,
                                }}
                                initial={{ x: defaultPos.x, y: defaultPos.y }}
                                transition={{
                                    type: "spring",
                                    stiffness: 200,
                                    damping: 20,
                                }}
                                onMouseEnter={() => setHoveredIndex(i)}
                            >
                                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition-colors hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700">
                                    <Icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                                </div>
                                <span
                                    className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/icon:opacity-100 dark:bg-neutral-100 dark:text-neutral-900"
                                    style={{ display: isSomethingHovered && !isHovered ? 'none' : 'block' }}
                                >
                                    {tech.name}
                                </span>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </BentoCard>
    );
}
