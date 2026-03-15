"use client";

import Image from "next/image";
import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";

export function ActivitiesCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Main Activities" className={className} delay={0.2}>
            <div className="flex flex-col gap-4 h-full">
                {siteConfig.mainActivities.map((activity) => (
                    <div
                        key={activity.name}
                        className="relative flex flex-1 items-center gap-3 rounded-xl bg-neutral-50 overflow-hidden p-2 transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-neutral-900">
                            <activity.icon className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                                {activity.name}
                            </h4>
                            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                {activity.description}
                            </p>
                        </div>
                        {activity.image && (
                            <div
                                className="absolute inset-y-0 right-0 w-28"
                                style={{ clipPath: "polygon(28% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
                            >
                                <Image
                                    src={activity.image}
                                    alt={activity.name}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </BentoCard>
    );
}
