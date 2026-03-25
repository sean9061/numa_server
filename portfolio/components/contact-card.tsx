"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { Mail, Copy, Check, Globe } from "lucide-react";
import { SiX } from "react-icons/si";
import Link from "next/link";
import { useState } from "react";

export function ContactCard({ className }: { className?: string }) {
    const [copied, setCopied] = useState(false);

    const copyEmail = () => {
        navigator.clipboard.writeText(siteConfig.email);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const xSocial = siteConfig.socials.find((s) => s.name === "X");
    const year = new Date().getFullYear();

    return (
        <BentoCard className={className} delay={0.5} title="Contact">
            <div className="flex h-full flex-col justify-between gap-4">

                {/* Links */}
                <div className="flex flex-col gap-2">
                    <a
                        href={`mailto:${siteConfig.email}`}
                        className="flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                    >
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="break-all">{siteConfig.email}</span>
                    </a>
                    <button
                        onClick={copyEmail}
                        className="flex w-fit items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition-all hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    >
                        {copied ? (
                            <><Check className="h-3.5 w-3.5 text-green-500" /><span className="text-green-500">Copied!</span></>
                        ) : (
                            <><Copy className="h-3.5 w-3.5" />Copy email</>
                        )}
                    </button>

                    <div className="mt-1 flex flex-col gap-1.5">
                        <Link
                            href={siteConfig.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                        >
                            <Globe className="h-4 w-4 shrink-0" />
                            <span>s3an.dev</span>
                        </Link>
                        {xSocial && (
                            <Link
                                href={xSocial.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                            >
                                <SiX className="h-4 w-4 shrink-0" />
                                <span>@sean_9061</span>
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    {/* Availability */}
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                        </span>
                        <span className="text-sm text-neutral-600 dark:text-neutral-300">{siteConfig.availability}</span>
                    </div>

                    {/* Copyright */}
                    <p className="text-xs text-neutral-400 dark:text-neutral-600">
                        © {year} {siteConfig.name}. All rights reserved.
                    </p>
                </div>
            </div>
        </BentoCard>
    );
}
