import { Github, Twitter, Instagram, Linkedin, Mail } from "lucide-react";

export const siteConfig = {
  name: "Sean Fisher",
  title: "地球人",
  description: "Building digital experiences with a focus on motion and minimalism.",
  location: "Tokyo, Japan",
  avatar: "/images/icon.jpg",
  socials: [
    {
      name: "GitHub",
      url: "https://github.com",
      icon: Github,
    },
    {
      name: "Twitter",
      url: "https://twitter.com",
      icon: Twitter,
    },
    {
      name: "Instagram",
      url: "https://instagram.com",
      icon: Instagram,
    },
  ],
  techStack: [
    { name: "React", icon: "react" },
    { name: "Next.js", icon: "nextjs" },
    { name: "TypeScript", icon: "typescript" },
    { name: "Tailwind CSS", icon: "tailwindcss" },
    { name: "Framer Motion", icon: "framermotion" },
    { name: "Docker", icon: "docker" },
  ],
  projects: [
    {
      title: "Project Alpha",
      description: "A revolutionary way to manage tasks.",
      image: "/images/project1.jpg",
      link: "https://example.com",
      year: "2024",
    },
    {
      title: "Beta App",
      description: "Social media for cats.",
      image: "/images/project2.jpg",
      link: "https://example.com",
      year: "2023",
    },
    {
      title: "Gamma Tools",
      description: "Developer utilities for the modern web.",
      image: "/images/project3.jpg",
      link: "https://example.com",
      year: "2023",
    },
  ],
  interests: {
    activities: ["Photography", "Hiking", "Coffee Brewing"],
    hobbies: ["Synthesizers", "Sci-Fi Novels", "Mechanical Keyboards"],
    music: {
      title: "Midnight City",
      artist: "M83",
      cover: "/images/album.jpg",
    },
  },
};
