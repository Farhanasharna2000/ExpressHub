"use client";

import { useRef, type RefObject } from "react";
import type { Locale } from "@/lib/i18n/config";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { SplitText } from "@/lib/gsap-hero";

// The parcel's resting position is the route's end point, so without JavaScript or with
// reduced motion it already sits at the destination.
export const ROUTE_PATH = "M 24 196 C 96 128, 150 214, 226 132 S 352 70, 396 34";
export const ROUTE_END = { x: 396, y: 34 };
const ROUTE_END_TRANSFORM = `translate(${ROUTE_END.x} ${ROUTE_END.y})`;

const RICH = "(min-width: 768px) and (pointer: fine)";
const MAX_TILT_DEG = 6;
const MAX_MAGNET_PX = 8;

// The visible headline is split into masked characters. Screen readers read one label
// made from the lines joined by spaces; SplitText's own label would run the lines together.
function splitHeadline(title: HTMLElement, timeline: gsap.core.Timeline, locale: Locale) {
  const lines = [...title.querySelectorAll<HTMLElement>(".hero-line")];
  const label = lines.map((line) => line.textContent?.trim()).filter(Boolean).join(" ");
  // A Bangla conjunct such as ক্ল is several code points that must stay in one box to join,
  // so Bangla reveals by whole word; Latin text still reveals letter by letter.
  const unit = locale === "bn" ? "words" : "chars";
  const split = SplitText.create(title, { type: unit === "words" ? "words" : "words,chars", mask: unit, aria: "auto" });
  if (label) title.setAttribute("aria-label", label);

  const pieces = unit === "words" ? split.words : split.chars;
  timeline.fromTo(pieces, { yPercent: 110 }, { yPercent: 0, duration: unit === "words" ? 0.6 : 0.7, stagger: unit === "words" ? 0.1 : 0.022, ease: "power4.out" }, 0.15);
  const accent = title.querySelector(".hero-accent");
  const accentChars = accent ? pieces.filter((piece) => accent.contains(piece)) : [];
  if (accentChars.length) {
    // A light wave runs through the key phrase once, then it settles on the brand colour.
    timeline.to(accentChars, { color: "#3fae7d", duration: 0.28, stagger: 0.035, yoyo: true, repeat: 1, ease: "sine.inOut" }, ">-0.15");
  }
  // Revert restores the original markup and label, so nothing stays clipped by the masks.
  timeline.call(() => split.revert());
  return () => split.revert();
}

// Draws the route while the parcel rides along it, then pops the destination pin and the
// "Delivered" chip. One run lasts under 5 seconds, so it needs no pause control.
function routeTimeline(stage: HTMLElement) {
  const path = stage.querySelector<SVGPathElement>(".journey-route path");
  const parcel = stage.querySelector<SVGGElement>(".journey-route-parcel-group");
  const pin = stage.querySelector<SVGCircleElement>(".journey-route-dest");
  const chip = stage.querySelector<SVGGElement>(".journey-route-chip");
  if (!path || !parcel) return null;

  const run = gsap.timeline({ paused: true });
  run.fromTo(path, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.8, ease: "power2.inOut" }, 0);
  // The plugin sets x/y from the path's own coordinates, which share the SVG's user space.
  run.to(parcel, { duration: 1.8, ease: "power2.inOut", motionPath: { path }, immediateRender: true }, 0);
  if (pin) run.fromTo(pin, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.45, ease: "back.out(2.6)" }, 1.65);
  if (chip) run.fromTo(chip, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 1.9);
  run.call(() => {
    // Back to the exact server-rendered end state, so a replay or a check sees the same markup.
    gsap.set([path, parcel], { clearProps: "all" });
    parcel.setAttribute("transform", ROUTE_END_TRANSFORM);
  });
  return run;
}

// Decorative layers drift at different speeds while the hero scrolls away.
function parallax(hero: HTMLElement, stage: HTMLElement) {
  const scrub = { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 };
  const layer = (selector: string, y: number) => {
    const targets = stage.querySelectorAll(selector);
    if (targets.length) gsap.to(targets, { y, ease: "none", scrollTrigger: scrub });
  };
  layer(".journey-hero-grid", -18);
  layer(".journey-route", -10);
}

// The stage tilts toward the cursor. quickTo keeps one
// tween per property, so pointer moves never pile up tweens.
function tilt(card: HTMLElement, stage: HTMLElement) {
  gsap.set(stage, { transformPerspective: 900 });
  const rotateX = gsap.quickTo(stage, "rotationX", { duration: 0.6, ease: "power3.out" });
  const rotateY = gsap.quickTo(stage, "rotationY", { duration: 0.6, ease: "power3.out" });

  const move = (event: PointerEvent) => {
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    rotateY(gsap.utils.clamp(-MAX_TILT_DEG, MAX_TILT_DEG, px * MAX_TILT_DEG * 2));
    rotateX(gsap.utils.clamp(-MAX_TILT_DEG, MAX_TILT_DEG, -py * MAX_TILT_DEG * 2));
  };
  const leave = () => {
    rotateX(0);
    rotateY(0);
  };
  card.addEventListener("pointermove", move);
  card.addEventListener("pointerleave", leave);
  return () => {
    card.removeEventListener("pointermove", move);
    card.removeEventListener("pointerleave", leave);
  };
}

// Hero buttons lean toward the cursor and spring back. They wait until their entrance
// has finished, so the two never fight over the same transform. Focus is unaffected.
function magnetic(buttons: HTMLElement[]) {
  let ready = false;
  gsap.delayedCall(1.8, () => { ready = true; });
  const cleanups = buttons.map((button) => {
    const toX = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3.out" });
    const toY = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3.out" });
    const move = (event: PointerEvent) => {
      if (!ready) return;
      const rect = button.getBoundingClientRect();
      const clamp = gsap.utils.clamp(-MAX_MAGNET_PX, MAX_MAGNET_PX);
      toX(clamp((event.clientX - (rect.left + rect.width / 2)) * 0.3));
      toY(clamp((event.clientY - (rect.top + rect.height / 2)) * 0.3));
    };
    const leave = () => {
      if (!ready) return;
      gsap.to(button, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
    };
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerleave", leave);
    return () => {
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerleave", leave);
    };
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

export function useHeroShowpiece(scope: RefObject<HTMLElement | null>, signedIn: boolean, locale: Locale) {
  const lastLocale = useRef<Locale | null>(null);
  useGSAP(() => {
    // Switching language swaps the text at once. The reveal and the route replay belong to
    // page load and sign-in only, so they are skipped when just the locale changed.
    const localeChanged = lastLocale.current !== null && lastLocale.current !== locale;
    lastLocale.current = locale;
    const root = scope.current;
    const hero = root?.querySelector<HTMLElement>(".hero");
    const title = root?.querySelector<HTMLElement>("[data-hero=title]");
    const card = root?.querySelector<HTMLElement>("[data-hero=journey]");
    const stage = root?.querySelector<HTMLElement>(".journey-hero-stage");
    if (!hero || !title || !card || !stage) return;

    // Phones get the headline and the route; fine pointers on wider screens also get depth,
    // tilt and magnetic buttons. With reduced motion none of this runs.
    gsap.matchMedia().add({ motion: MOTION_OK, rich: RICH }, (context) => {
      const { motion, rich } = context.conditions as { motion: boolean; rich: boolean };
      if (!motion) return;
      const cleanups: (() => void)[] = [];

      if (!localeChanged) {
        const intro = gsap.timeline();
        cleanups.push(splitHeadline(title, intro, locale));
      }

      const route = routeTimeline(stage);
      if (route) {
        if (!localeChanged) gsap.delayedCall(0.6, () => { route.restart(); });
        // Replays once each time the hero scrolls back into view.
        ScrollTrigger.create({ trigger: stage, start: "top bottom", end: "bottom top", onEnterBack: () => route.restart() });
        const onVisibility = () => (document.hidden ? route.pause() : route.resume());
        document.addEventListener("visibilitychange", onVisibility);
        cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
      }

      if (rich) {
        parallax(hero, stage);
        cleanups.push(tilt(card, stage));
        cleanups.push(magnetic([...root!.querySelectorAll<HTMLElement>("[data-hero=actions] > a")]));
      }
      return () => cleanups.forEach((cleanup) => cleanup());
    });
  }, { scope, dependencies: [signedIn, locale], revertOnUpdate: true });
}
