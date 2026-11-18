"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, whenMotionAllowed } from "@/lib/gsap";

// Staggers matching children in once on mount. Lets server-rendered lists animate
// without becoming client components themselves.
export function StaggerIn({ children, selector = ":scope > *", className }: { children: ReactNode; selector?: string; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    whenMotionAllowed(() => {
      const items = scope.current?.querySelectorAll(selector);
      if (!items?.length) return;
      gsap.fromTo(items, { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.45, clearProps: "opacity,transform" });
    });
  }, { scope });
  return <div ref={scope} className={className}>{children}</div>;
}

// Fades a block in when it mounts, for content that arrives later such as a chat answer.
export function RevealIn({ children, animate = true, className }: { children: ReactNode; animate?: boolean; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!animate) return;
    whenMotionAllowed(() => {
      gsap.fromTo(scope.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, clearProps: "opacity,transform" });
    });
  }, { scope, dependencies: [animate] });
  return <div ref={scope} className={className}>{children}</div>;
}
