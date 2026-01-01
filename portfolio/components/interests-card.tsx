import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";

export function InterestsCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Hobbies" className={className} delay={0.4}>
            <div className="flex flex-col gap-2">
                {siteConfig.interests.hobbies.map((hobby) => (
                    <div
                        key={hobby.name}
                        className="flex items-center gap-3 rounded-lg bg-neutral-50 p-2 transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    >
                        <hobby.icon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {hobby.name}
                        </span>
                    </div>
                ))}
            </div>
        </BentoCard>
    );
}
