"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// framer-motion animates in JavaScript, so the CSS prefers-reduced-motion rule in
// globals.css does not reach it. This makes every motion component honour that setting.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
