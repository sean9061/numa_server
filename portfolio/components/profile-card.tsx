"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { MapPin, Building2 } from "lucide-react";
import Image from "next/image";

export function ProfileCard({ className }: { className?: string }) {
    return (
        <BentoCard className={className} delay={0.1}>
            <div className="flex h-full flex-col justify-between gap-4">
                {/* Icon (Avatar) */}
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
                        <span>{siteConfig.location}</span>
                    </div>
                    {/* @ts-ignore */}
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-200">
                        <Building2 className="h-4 w-4 text-neutral-500" />
                        <span>{siteConfig.affiliation}</span>
                    </div>
                </div>
            </div>
        </BentoCard>
    );
}
