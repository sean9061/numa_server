"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/components/ui/theme-provider";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";

type Activity = (typeof siteConfig.mainActivities)[number];

function ActivityModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
    const images = activity.images?.length ? activity.images : activity.image ? [activity.image] : [];
    const [current, setCurrent] = useState(0);

    const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent((c) => (c - 1 + images.length) % images.length); };
    const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent((c) => (c + 1) % images.length); };

    useEffect(() => {
        if (images.length <= 1) return;
        const id = setInterval(() => setCurrent((c) => (c + 1) % images.length), 3000);
        return () => clearInterval(id);
    }, [images.length]);

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-900"
                    initial={{ scale: 0.92, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 16 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                >
                    <div className="relative aspect-video w-full bg-neutral-100 dark:bg-neutral-800">
                        {images.length > 0 ? (
                            <>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={current}
                                        className="absolute inset-0"
                                        initial={{ opacity: 0, x: 40 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -40 }}
                                        transition={{ duration: 0.25 }}
                                    >
                                        <Image src={images[current]} alt={`${activity.name} ${current + 1}`} fill className="object-cover" />
                                    </motion.div>
                                </AnimatePresence>
                                {images.length > 1 && (
                                    <>
                                        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {images.map((_, i) => (
                                                <button key={i} onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                                                    className={`h-1.5 rounded-full transition-all duration-200 ${i === current ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <activity.icon className="h-16 w-16 text-neutral-300 dark:text-neutral-600" />
                            </div>
                        )}
                    </div>
                    <div className="p-5">
                        <div className="mb-1 flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                                <activity.icon className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{activity.name}</h3>
                        </div>
                        <p className="mb-1 text-sm text-neutral-500 dark:text-neutral-400">{activity.description}</p>
                        {activity.detail && (
                            <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{activity.detail}</p>
                        )}
                        {activity.links.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {activity.links.map((link) => (
                                    <Link
                                        key={link.url}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                    >
                                        <link.icon className="h-3.5 w-3.5" />
                                        {link.label}
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export function ActivitiesCard({ className }: { className?: string }) {
    const { theme } = useTheme();
    const dark = theme === "dark";
    const [selected, setSelected] = useState<Activity | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    return (
        <>
            <BentoCard title="Main Activities" className={className} delay={0.3}>
                <div className="flex flex-col gap-4 h-full">
                    {siteConfig.mainActivities.map((activity, index) => (
                        <button
                            key={activity.name}
                            onClick={() => setSelected(activity)}
                            onPointerEnter={(e) => { if (e.pointerType === "mouse") setHoveredIndex(index); }}
                            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHoveredIndex(null); }}
                            className="relative flex flex-1 items-center gap-3 rounded-xl bg-neutral-50 overflow-hidden p-2 pr-[68px] sm:pr-[104px] transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-left w-full cursor-pointer"
                        >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-neutral-900">
                                <activity.icon className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                                    {activity.name}
                                </h4>
                                <div className="mt-0.5 flex gap-1 overflow-hidden">
                                    {activity.stack.map((tech) => (
                                        <span
                                            key={tech}
                                            className="rounded-full border border-neutral-300 px-1.5 py-0 text-neutral-400 dark:border-neutral-600 dark:text-neutral-500 whitespace-nowrap shrink min-w-0"
                                            style={{ fontSize: "clamp(7px, 1.8vw, 10px)" }}
                                        >
                                            {tech}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            {activity.image && (
                                <div
                                    className="absolute inset-y-0 right-0 w-[60px] sm:w-24"
                                    style={{ clipPath: "polygon(28% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
                                >
                                    <Image
                                        src={activity.image}
                                        alt={activity.name}
                                        fill
                                        className="object-cover scale-110 transition-all duration-200"
                                        style={{ filter: hoveredIndex === index ? "blur(0px)" : "blur(0.5px)" }}
                                    />
                                    <div
                                        className="absolute inset-0 transition-opacity duration-200"
                                        style={{
                                            background: dark ? "rgba(0,0,0,0.20)" : "rgba(0,0,0,0.06)",
                                            opacity: hoveredIndex === index ? 0 : 1,
                                        }}
                                    />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </BentoCard>

            {selected && (
                <ActivityModal activity={selected} onClose={() => setSelected(null)} />
            )}
        </>
    );
}
