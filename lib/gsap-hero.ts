"use client";

import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { SplitText } from "gsap/SplitText";
import { gsap } from "@/lib/gsap";

// Imported only by the home hero, so these plugins stay out of every other page's bundle.
gsap.registerPlugin(SplitText, MotionPathPlugin, DrawSVGPlugin);

export { SplitText };
