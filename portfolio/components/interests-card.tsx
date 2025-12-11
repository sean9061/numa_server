"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { Disc, Music, Activity, Coffee } from "lucide-react";
import Image from "next/image";

export function InterestsCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Interests" className={className} delay={0.4}>
            <div className="flex flex-col gap-6">

                {/* Hobbies & Activities */}
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {siteConfig.interests.hobbies.map((hobby) => (
                            <span
                                key={hobby}
                                className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                            >
                                #{hobby}
                            </span>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {siteConfig.interests.activities.map((activity) => (
                            <div key={activity} className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                                <Activity className="h-3 w-3" />
                                <span>{activity}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Music Player Widget */}
                <div className="mt-auto rounded-xl bg-neutral-900 p-4 text-white dark:bg-neutral-800">
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
