"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { MapPin } from "lucide-react";
import Image from "next/image";

export function ProfileCard({ className }: { className?: string }) {
    return (
        <BentoCard className={className} delay={0.1}>
            <div className="flex h-full flex-col justify-between gap-4">
                <div className="flex items-start justify-between">
                    <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-neutral-100 dark:border-neutral-800">
                        {/* Placeholder for avatar if image fails or is missing */}
                        <div className="absolute inset-0 bg-neutral-200 dark:bg-neutral-800" />
                        <Image
                            src={siteConfig.avatar}
                            alt={siteConfig.name}
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                    <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        Available for hire
                    </div>
                </div>

                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                        {siteConfig.name}
                    </h1>
                    <p className="text-base text-neutral-600 dark:text-neutral-400">
                        {siteConfig.title}
                    </p>
                </div>

                <div className="space-y-3">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {siteConfig.description}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                        <MapPin className="h-3 w-3" />
                        <span>{siteConfig.location}</span>
                    </div>
                </div>
            </div>
        </BentoCard>
    );
}
