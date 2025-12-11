"use client";

import { BentoCard } from "@/components/ui/bento-card";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface ProjectCardProps {
    project: {
        title: string;
        description: string;
        image: string;
        link: string;
        year: string;
    };
    className?: string;
    delay?: number;
}

export function ProjectCard({ project, className, delay = 0 }: ProjectCardProps) {
    return (
        <BentoCard className={className} delay={delay}>
            <Link href={project.link} target="_blank" className="group flex h-full flex-col">
                <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                    {/* Placeholder for project image */}
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
                        <span className="text-sm">Image Preview</span>
                    </div>
                    {/* Uncomment when real images are available
          <Image
            src={project.image}
            alt={project.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          */}
                </div>

                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                            {project.title}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                            {project.description}
                        </p>
                    </div>
                    <div className="rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                        {project.year}
                    </div>
                </div>

                <div className="mt-auto pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
                        View Project
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                    </div>
                </div>
            </Link>
        </BentoCard>
    );
}
