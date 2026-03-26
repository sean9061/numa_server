"use client";

import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { MapPin, X } from "lucide-react";
import { SiInstagram } from "react-icons/si";

type Photo = (typeof siteConfig.photos)[number];

function PhotoModal({ photos, initialIndex, onClose }: {
    photos: Photo[];
    initialIndex: number;
    onClose: () => void;
}) {
    const [selected, setSelected] = useState(initialIndex);
    const photo = photos[selected];

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
                <motion.div
                    className="relative z-10 flex w-full max-w-3xl overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl"
                    initial={{ scale: 0.92, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 16 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    style={{ maxHeight: "85vh" }}
                >
                    {/* Left: thumbnail list */}
                    <div className="flex w-20 flex-col gap-1.5 overflow-y-auto bg-black/30 p-2">
                        {photos.map((p, i) => (
                            <button
                                key={i}
                                onClick={() => setSelected(i)}
                                className={`relative aspect-square w-full flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${i === selected ? "ring-2 ring-white" : "opacity-50 hover:opacity-80"}`}
                            >
                                <Image src={p.image} alt={p.title} fill className="object-cover" />
                            </button>
                        ))}
                    </div>

                    {/* Right: large photo + info */}
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="relative flex-1 bg-black" style={{ minHeight: "300px" }}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={selected}
                                    className="absolute inset-0"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Image src={photo.image} alt={photo.title} fill className="object-contain" />
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Info */}
                        <div className="flex items-start justify-between gap-4 bg-neutral-900 px-5 py-4">
                            <div className="flex flex-col gap-1">
                                <h3 className="font-semibold text-white">{photo.title}</h3>
                                {photo.location && (
                                    <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>{photo.location}</span>
                                    </div>
                                )}
                            </div>
                            {photo.instagramUrl && (
                                <Link
                                    href={photo.instagramUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-pink-500 hover:text-pink-400"
                                >
                                    <SiInstagram className="h-3.5 w-3.5" />
                                    Instagram
                                </Link>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function PhotoCard({ className }: { className?: string }) {
    const [photos] = useState(() => shuffle(siteConfig.photos));
    const [current, setCurrent] = useState(0);
    const [modalIndex, setModalIndex] = useState<number | null>(null);

    useEffect(() => {
        if (photos.length <= 1) return;
        const id = setInterval(() => setCurrent((c) => (c + 1) % photos.length), 10000);
        return () => clearInterval(id);
    }, [photos.length]);

    const photo = photos[current];

    return (
        <>
            <BentoCard className={className} delay={0.4}>
                <div
                    className="absolute -inset-6 cursor-pointer overflow-hidden rounded-3xl"
                    onClick={() => setModalIndex(current)}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={current}
                            className="absolute inset-0"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <Image src={photo.image} alt={photo.title} fill className="object-cover" />
                        </motion.div>
                    </AnimatePresence>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 40px 10px rgba(0,0,0,0.5)" }} />

                    <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="font-semibold text-white">{photo.title}</p>
                        {photo.location && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
                                <MapPin className="h-3 w-3" />
                                <span>{photo.location}</span>
                            </div>
                        )}
                    </div>

                    {photos.length > 1 && (
                        <div className="absolute bottom-4 right-4 flex gap-1.5">
                            {photos.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                                    className={`h-1.5 rounded-full transition-all duration-200 ${i === current ? "w-4 bg-white" : "w-1.5 bg-white/40"}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </BentoCard>

            {modalIndex !== null && (
                <PhotoModal photos={photos} initialIndex={modalIndex} onClose={() => setModalIndex(null)} />
            )}
        </>
    );
}
