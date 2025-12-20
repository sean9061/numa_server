import { siteConfig } from "@/data/config";
import { BentoCard } from "@/components/ui/bento-card";

export function InterestsCard({ className }: { className?: string }) {
    return (
        <BentoCard title="Hobbies" className={className} delay={0.4}>
            <div className="flex flex-col gap-6">

                {/* Hobbies */}
                <div>
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
                </div>

            </div>
        </BentoCard>
    );
}
