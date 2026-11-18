"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { formatCount, parseCountTarget } from "@/lib/count-up";

gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin);
gsap.defaults({ ease: "power3.out", duration: 0.6 });

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

// Every animation runs inside this media query, so with reduced motion nothing moves
// and content simply stays in its final, server-rendered state. Called inside useGSAP,
// the matchMedia instance is reverted with the component.
export function whenMotionAllowed(setup: () => void | (() => void)) {
  gsap.matchMedia().add(MOTION_OK, setup);
}

// Counts an element's figure up from zero. It writes to the existing text node so React
// keeps ownership of it, stops as soon as React changes the text (fresh data wins), and
// always finishes on the exact text that was rendered. The returned function restores
// that text; return it from the whenMotionAllowed setup so a revert (unmount, or React
// Strict Mode running effects twice) never leaves a half-counted number behind.
export function countUp(element: Element, options: { duration?: number; delay?: number; scrollTrigger?: ScrollTrigger.Vars } = {}) {
  const node = element.childNodes.length === 1 ? element.firstChild : null;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const finalText = node.nodeValue ?? "";
  const target = parseCountTarget(finalText);
  if (!target || target.value === 0) return null;

  // Until the count starts (after a delay or on scroll) the real figure stays visible.
  let written = finalText;
  const state = { value: 0 };
  const tween = gsap.to(state, {
    value: target.value,
    duration: options.duration ?? 0.8,
    delay: options.delay ?? 0,
    ease: "power2.out",
    scrollTrigger: options.scrollTrigger,
    onStart() {
      if (node.nodeValue !== written) {
        tween.kill();
        return;
      }
      written = formatCount(target, 0);
      node.nodeValue = written;
    },
    onUpdate() {
      if (node.nodeValue !== written) {
        tween.kill();
        return;
      }
      written = formatCount(target, state.value);
      node.nodeValue = written;
    },
    onComplete() {
      if (node.nodeValue === written) node.nodeValue = finalText;
    },
  });
  return () => {
    tween.scrollTrigger?.kill();
    tween.kill();
    if (node.nodeValue === written) node.nodeValue = finalText;
  };
}

export function countUpAll(elements: Iterable<Element>, options: Parameters<typeof countUp>[1] = {}) {
  const restores = [...elements].map((element, index) =>
    countUp(element, { ...options, delay: (options.delay ?? 0) + index * 0.06 }));
  return () => restores.forEach((restore) => restore?.());
}

export { gsap, ScrollTrigger, useGSAP };
