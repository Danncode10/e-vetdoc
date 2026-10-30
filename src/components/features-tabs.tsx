"use client";

import { useRef, type MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  Clipboard,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from "lucide-react";

const FEATURES = [
  {
    icon: Clipboard,
    title: "Their care, easy to find",
    description:
      "Keep your pet’s profile, shared care details, and appointment history together in one familiar place.",
    span: "lg:col-span-2 lg:row-span-2",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 50%)",
  },
  {
    icon: CalendarDays,
    title: "Request a visit with confidence",
    description:
      "Choose your pet, explain what they need, and send a clear request to your clinic.",
    span: "lg:col-span-2",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 50%)",
  },
  {
    icon: Bell,
    title: "Never miss an update",
    description:
      "Follow appointment progress and clinic updates without chasing messages or paperwork.",
    span: "",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 50%)",
  },
  {
    icon: Stethoscope,
    title: "Stay close to their care",
    description:
      "Review the care information your veterinarian has shared when it matters most.",
    span: "",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 50%)",
  },
  {
    icon: UsersRound,
    title: "Made for every pet family",
    description:
      "Pet owners can each have a secure view of the pets they care for.",
    span: "lg:col-span-2",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 50%)",
  },
  {
    icon: ShieldCheck,
    title: "Your information, kept private",
    description:
      "Your clinic shares care information only with the people connected to your pet.",
    span: "lg:col-span-2",
    glow: "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 50%)",
  },
] as const;

function BentoCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!ref.current || frameRef.current !== null) return;

    const { clientX, clientY } = event;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      ref.current.style.setProperty("--x", `${clientX - rect.left}px`);
      ref.current.style.setProperty("--y", `${clientY - rect.top}px`);
    });
  };

  const Icon = feature.icon;

  return (
    <motion.article
      ref={ref}
      onMouseMove={handleMove}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.65,
        delay: index * 0.06,
        ease: [0.34, 1.35, 0.64, 1],
      }}
      style={{ willChange: "transform" }}
      className={`group relative overflow-hidden rounded-3xl border border-border bg-card p-1.5 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-primary/40 hover:-translate-y-1 ${feature.span}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(360px circle at var(--x) var(--y), color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 70%)",
        }}
      />

      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-0.375rem)] bg-card p-7 md:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: feature.glow }} />
        <div className="relative mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted text-primary transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[-3deg]">
          <Icon className="h-5 w-5" strokeWidth={1.7} />
        </div>
        <h3 className="relative mb-2 text-[15px] font-semibold tracking-tight text-foreground">
          {feature.title}
        </h3>
        <p className="relative text-[13px] leading-relaxed text-muted-foreground">
          {feature.description}
        </p>
      </div>
    </motion.article>
  );
}

export function FeaturesTabs() {
  return (
    <div className="px-4">
      <div className="grid grid-cols-1 auto-rows-[minmax(180px,auto)] gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {FEATURES.map((feature, index) => (
          <BentoCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </div>
  );
}
