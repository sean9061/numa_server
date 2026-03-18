"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SocialLinksCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Connect" className={className} delay={0.6}>
            <div className="flex flex-col gap-3">
                {siteConfig.socials.map((social) => (
                    <Link
                        key={social.name}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between rounded-xl bg-neutral-50 p-4 transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    >
                        <div className="flex items-center gap-3">
                            <social.icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                            <span className="font-medium text-neutral-900 dark:text-white">
                                {social.name}
                            </span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                    </Link>
                ))}
            </div>
        </BentoCard>
    );
}
