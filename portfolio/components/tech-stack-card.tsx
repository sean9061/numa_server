"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { motion } from "framer-motion";
import { useState } from "react";
import { Globe } from "lucide-react";
import {
    SiReact,
    SiNextdotjs,
    SiTypescript,
    SiDocker,
    SiGit,
    SiUnity,
    SiArduino,
    SiGo,
    SiPostgresql,
    SiAutodesk
} from "react-icons/si";

const iconMap: Record<string, any> = {
    react: SiReact,
    nextjs: SiNextdotjs,
    typescript: SiTypescript,
    docker: SiDocker,
    git: SiGit,
    unity: SiUnity,
    web: Globe,
    go: SiGo,
    arduino: SiArduino,
    postgresql: SiPostgresql,
    fusion: SiAutodesk,
};

const CIRCLE_SIZE = 250;   // px — 円のサイズ
const CIRCLE_OFFSET_Y = 10; // px — 正の値で下に移動、負の値で上に移動

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

    const colorMap: Record<string, string> = {
        react: "#61DAFB",
        nextjs: "#333333",
        typescript: "#3178C6",
        docker: "#2496ED",
        git: "#F05032",
        unity: "#000000",
        postgresql: "#336791",
        go: "#00ADD8",
        arduino: "#00979D",
        fusion: "#F6670E",
    };

    return (
        <BentoCard title="Tech Stack" className={className} delay={0.3}>
            <div className="absolute inset-0 flex items-center justify-center p-6" style={{ transform: `translateY(${CIRCLE_OFFSET_Y}px)` }}>
                <div
                    className="relative flex aspect-square w-full items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
                    style={{ maxWidth: CIRCLE_SIZE }}
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {siteConfig.techStack.map((tech, i) => {
                        const Icon = iconMap[tech.icon] || Globe;
                        const isHovered = hoveredIndex === i;
                        const isSomethingHovered = hoveredIndex !== null;
                        const defaultPos = positions[i];
                        const glowColor = colorMap[tech.icon] || "#888888";

                        // Determine target state
                        let targetX = defaultPos.x;
                        let targetY = defaultPos.y;
                        let targetScale = 1;
                        let zIndex = 1;

                        if (isSomethingHovered) {
                            // Calculate "effective" centered position for the hovered item
                            // We clamp it so it doesn't overflow when expanded
                            let activeHoverPos = { x: 0, y: 0 };
                            if (hoveredIndex !== null) {
                                const rawHoverPos = positions[hoveredIndex];
                                const rawDist = Math.sqrt(rawHoverPos.x * rawHoverPos.x + rawHoverPos.y * rawHoverPos.y);
                                const maxHoverDist = 65; // Max radius for center of expanded icon
                                if (rawDist > maxHoverDist) {
                                    const angle = Math.atan2(rawHoverPos.y, rawHoverPos.x);
                                    activeHoverPos = {
                                        x: maxHoverDist * Math.cos(angle),
                                        y: maxHoverDist * Math.sin(angle)
                                    };
                                } else {
                                    activeHoverPos = rawHoverPos;
                                }
                            }

                            if (isHovered) {
                                // Hovered item stays in place (or clamped place) but grows
                                targetX = activeHoverPos.x;
                                targetY = activeHoverPos.y;
                                targetScale = 2.2;
                                zIndex = 50;
                            } else if (hoveredIndex !== null) {
                                // Repulsion logic using the CLAMPED position of the hovered item
                                const dx = defaultPos.x - activeHoverPos.x;
                                const dy = defaultPos.y - activeHoverPos.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                // Push away if close
                                if (dist < 80) { // Reduced threshold for tighter packing
                                    const force = (80 - dist) * 0.8;
                                    const angle = Math.atan2(dy, dx);
                                    targetX += force * Math.cos(angle);
                                    targetY += force * Math.sin(angle);
                                }

                                // Boundary constraint: Keep within the circle
                                const maxR = 85;
                                const distFromCenter = Math.sqrt(targetX * targetX + targetY * targetY);
                                if (distFromCenter > maxR) {
                                    const angleFromCenter = Math.atan2(targetY, targetX);
                                    targetX = maxR * Math.cos(angleFromCenter);
                                    targetY = maxR * Math.sin(angleFromCenter);
                                }

                                targetScale = 0.7;
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
                                <a
                                    href={tech.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block h-full w-full"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div
                                        className={`relative flex h-10 w-10 flex-col items-center justify-center rounded-full bg-white transition-all duration-300 dark:bg-neutral-800 ${isHovered ? 'bg-neutral-50 dark:bg-neutral-700' : ''}`}
                                        style={{
                                            boxShadow: isHovered
                                                ? `0 0 20px 2px ${glowColor}80`
                                                : `0 0 10px -1px ${glowColor}50`
                                        }}
                                    >
                                        <Icon className={`h-5 w-5 text-neutral-600 transition-all duration-300 dark:text-neutral-400 ${isHovered ? '-translate-y-2 scale-70' : ''}`} />
                                        <span
                                            className={`absolute top-[60%] w-full text-center text-[6px] font-medium leading-tight text-neutral-900 transition-opacity duration-300 dark:text-neutral-100 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                                        >
                                            {tech.name}
                                        </span>
                                    </div>
                                </a>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </BentoCard>
    );
}
