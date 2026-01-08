import { ProfileCard } from "@/components/profile-card";
import { ActivitiesCard } from "@/components/activities-card";
import { SocialLinksCard } from "@/components/social-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { ProjectCard } from "@/components/project-card";
import { InterestsCard } from "@/components/interests-card";
import { siteConfig } from "@/data/config";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 p-4 text-neutral-900 md:p-8 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">

        {/* Row 1 & 2: Tetris Layout */}

        {/* Profile: Top Left (2x1) */}
        <ProfileCard className="col-span-1 md:col-span-2 lg:col-span-2 aspect-auto md:aspect-[2/1]" />

        {/* Activities: Right (2x2) - Spans 2 rows */}
        <ActivitiesCard className="col-span-1 md:col-span-2 lg:col-span-2 lg:row-span-2 aspect-auto md:aspect-square h-full" />

        {/* Tech Stack: Left (1x1) */}
        <TechStackCard className="col-span-1 md:col-span-1 aspect-square" />

        {/* Social: Middle (1x1) */}
        <SocialLinksCard className="col-span-1 aspect-square" />

        {/* Row 3 */}

        {/* Interests: Row 3 Middle (2x1) */}
        <InterestsCard className="col-span-1 md:col-span-2 lg:col-span-2 aspect-auto md:aspect-[2/1]" />
      </div>

      <div className="my-10 w-full border-t border-dashed border-neutral-200 dark:border-neutral-800" />

      <div className="mx-auto max-w-7xl">
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Projects gallery
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteConfig.projects.map((project, index) => (
            <ProjectCard
              key={project.title}
              project={project}
              className="aspect-square"
              delay={0.1 * index}
            />
          ))}
        </div>

      </div>
    </main>
  );
}
