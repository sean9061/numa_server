"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
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
    return (
        <BentoCard title="Tech Stack" className={className} delay={0.3}>
            <div className="grid grid-cols-2 gap-3">
                {siteConfig.techStack.map((tech) => {
                    const Icon = iconMap[tech.icon] || Globe;
                    return (
                        <div
                            key={tech.name}
                            className="flex items-center gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800"
                        >
                            <Icon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                {tech.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </BentoCard>
    );
}
