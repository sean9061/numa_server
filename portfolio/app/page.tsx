import { ProfileCard } from "@/components/profile-card";
import { ActivitiesCard } from "@/components/activities-card";
import { SocialLinksCard } from "@/components/social-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { ProjectCard } from "@/components/project-card";
import { InterestsCard } from "@/components/interests-card";
import { MusicCard } from "@/components/music-card";
import { siteConfig } from "@/data/config";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 p-4 text-neutral-900 md:p-8 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">

        {/* Row 1 & 2: Tetris Layout */}

        {/* Profile: Top Left (2x1) */}
        <ProfileCard className="col-span-1 md:col-span-2 lg:col-span-2 aspect-[2/1]" />

        {/* Activities: Right (2x2) - Spans 2 rows */}
        <ActivitiesCard className="col-span-1 md:col-span-2 lg:col-span-2 lg:row-span-2 aspect-square h-full" />

        {/* Social & Tech: Bottom Left (1x1 each) */}
        <SocialLinksCard className="col-span-1 aspect-square" />
        <TechStackCard className="col-span-1 aspect-square" />

        {/* Row 3: Interests (1), Music (1), Projects (2) */}
        <InterestsCard className="col-span-1 aspect-square" />
        <MusicCard className="col-span-1 aspect-square" />

        <div className="col-span-1 md:col-span-2 lg:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {siteConfig.projects.map((project, index) => (
            <ProjectCard
              key={project.title}
              project={project}
              className="aspect-square"
              delay={0.4 + index * 0.1}
            />
          ))}
        </div>

      </div>
    </main>
  );
}
