import { Github, Twitter, Instagram, Linkedin, Mail, Box, Rocket, Sprout, Server, Car, Snowflake, Printer, Camera, Pickaxe } from "lucide-react";

export const siteConfig = {
  name: "Sean Fisher",
  nameJa: "フィッシャー 翔音",
  title: "ホモサピエンス",
  affiliation: "Tokyo University of Technology",
  location: "地球",
  avatar: "/images/icon.jpg",
  socials: [
    {
      name: "GitHub",
      url: "https://github.com/sean9061",
      icon: Github,
    },
    {
      name: "Twitter",
      url: "https://twitter.com/sean_9061",
      icon: Twitter,
    },
    {
      name: "Instagram",
      url: "https://instagram.com/sean_9061.p",
      icon: Instagram,
    },
  ],
  mainActivities: [
    {
      name: "XR開発",
      description: "Immersive experiences using Unity & WebXR.",
      icon: Box,
    },
    {
      name: "ロケットのペイロード開発",
      description: "Mission critical systems for aerospace.",
      icon: Rocket,
    },
    {
      name: "土壌センサーのIoT開発",
      description: "Smart agriculture solutions.",
      icon: Sprout,
    },
    {
      name: "マイクラ鯖",
      description: "Server administration & plugins.",
      icon: Server,
    },
    {
      name: "マイコンカーラリー",
      description: "Embedded systems & autonomous driving.",
      icon: Car,
    },
  ],
  techStack: [
    { name: "Go", icon: "go", url: "https://go.dev" },
    { name: "TypeScript", icon: "typescript", url: "https://www.typescriptlang.org" },
    { name: "Arduino", icon: "arduino", url: "https://www.arduino.cc" },
    { name: "Unity", icon: "unity", url: "https://unity.com" },
    { name: "React", icon: "react", url: "https://react.dev" },
    { name: "Next.js", icon: "nextjs", url: "https://nextjs.org" },
    { name: "Docker", icon: "docker", url: "https://www.docker.com" },
    { name: "PostgreSQL", icon: "postgresql", url: "https://www.postgresql.org" },
    { name: "Fusion 360", icon: "fusion", url: "https://www.autodesk.com/products/fusion-360/overview" },
    { name: "Git", icon: "git", url: "https://git-scm.com" },
  ],
  projects: [
    {
      title: "マイコンカー「Lami_01」",
      description: "マイコンカーラリー アドバンスクラスの車体",
      image: "/images/lami_01.png",
      link: "",
      year: "2026",
      video: "",
      gltf: "/models/Lami_01.glb",
    },
    {
      title: "Assistant May",
      description: "Web×IoT メイカーズチャレンジ PLUS 2022 \n全国最優秀賞 総務省国際戦略局長賞 受賞 \nIoTを活用した生活支援アシスタント",
      image: "/images/assistant-may.jpg",
      link: "https://webiotmakers.github.io/2022/winners/",
      year: "2023/03",
      video: "https://www.youtube.com/watch?v=H77eqvaX4Yg",
    },
  ],
  interests: {
    hobbies: [
      { name: "スキー", icon: Snowflake },
      { name: "多肉植物", icon: Sprout },
      { name: "3Dプリンター", icon: Printer },
      { name: "カメラ", icon: Camera },
      { name: "マイクラ", icon: Pickaxe },
    ],
  },
};
