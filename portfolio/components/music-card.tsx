"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { Disc, Music } from "lucide-react";

export function MusicCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Listening" className={className} delay={0.4}>
            <div className="flex h-full flex-col justify-end">
                <div className="rounded-xl bg-neutral-900 p-4 text-white dark:bg-neutral-800">
                    <div className="flex items-center gap-4">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                            {/* Placeholder for album art */}
                            <div className="absolute inset-0 flex items-center justify-center bg-neutral-700">
                                <Music className="h-6 w-6 text-neutral-400" />
                            </div>
                            {/* Uncomment when real image is available
              <Image
                src={siteConfig.interests.music.cover}
                alt={siteConfig.interests.music.title}
                fill
                className="object-cover"
              />
              */}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                                <Disc className="h-3 w-3 animate-spin-slow" />
                                <p className="truncate text-sm font-medium">Now Listening</p>
                            </div>
                            <p className="truncate text-sm font-bold text-neutral-100">
                                {siteConfig.interests.music.title}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                                {siteConfig.interests.music.artist}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </BentoCard>
    );
}
