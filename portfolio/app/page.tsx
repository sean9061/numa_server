import { ProfileCard } from "@/components/profile-card";
import { SocialLinksCard } from "@/components/social-card";
import { TechStackCard } from "@/components/tech-stack-card";
import { ProjectCard } from "@/components/project-card";
import { InterestsCard } from "@/components/interests-card";
import { siteConfig } from "@/data/config";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 p-4 text-neutral-900 md:p-8 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">

        {/* Row 1: Profile (2), Social (1), Tech (1) */}
        <ProfileCard className="col-span-1 md:col-span-2 lg:col-span-2" />
        <SocialLinksCard className="col-span-1" />
        <TechStackCard className="col-span-1" />

        {/* Row 2: Interests (1), Projects (3) */}
        <InterestsCard className="col-span-1 md:col-span-1 lg:col-span-1 h-full" />

        <div className="col-span-1 md:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteConfig.projects.map((project, index) => (
            <ProjectCard
              key={project.title}
              project={project}
              delay={0.4 + index * 0.1}
            />
          ))}
        </div>

      </div>
    </main>
  );
}
