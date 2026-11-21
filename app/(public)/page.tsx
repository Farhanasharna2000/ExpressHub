"use client";

import { ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useAppLocale, useFormat, useStatusLabel } from "@/lib/i18n/use-format";
import { ButtonLink, StatusBadge } from "@/components/ui/primitives";
import {
  MotionFloat,
  InteractiveDeliveryTracker,
  AnimatedMetricCard,
  FeatureCardWithImage,
} from "@/components/ui/motion";
import { countUpAll, gsap, ScrollTrigger, useGSAP, whenMotionAllowed } from "@/lib/gsap";
import { useSession } from "@/features/auth/provider";
import { roleHome } from "@/features/auth/session";
import { TrackForm } from "@/features/tracking/track-form";
import { ROUTE_END, ROUTE_PATH, useHeroShowpiece } from "@/features/home/hero-showpiece";

// Entrances always state their end values. A from() tween reads the end from computed
// styles, which is wrong mid CSS transition (buttons animate opacity) or when the setup
// runs again before a revert has settled, leaving elements stuck transparent.
function enter(timeline: gsap.core.Timeline, targets: string, offset: gsap.TweenVars, position: gsap.Position, vars: gsap.TweenVars = {}) {
  timeline.fromTo(targets, { opacity: 0, x: 0, y: 0, ...offset }, { opacity: 1, x: 0, y: 0, clearProps: "opacity,transform", ...vars }, position);
}

function useHomeAnimations(scope: React.RefObject<HTMLDivElement | null>, signedIn: boolean) {
  useGSAP(() => {
    whenMotionAllowed(() => {
      // The headline and the delivery route belong to useHeroShowpiece; these entrances
      // use fixed positions so they line up with its headline reveal.
      const intro = gsap.timeline({ defaults: { duration: 0.7, ease: "power3.out" } });
      enter(intro, "[data-hero=badge]", { y: 14 }, 0, { duration: 0.5 });
      enter(intro, "[data-hero=text]", { y: 18 }, 0.75);
      enter(intro, "[data-hero=actions] > *", { y: 14 }, 0.9, { stagger: 0.08, duration: 0.5 });
      enter(intro, "[data-hero=checks] > *", { y: 10 }, 1.1, { stagger: 0.06, duration: 0.4 });
      enter(intro, "[data-hero=track]", { y: 16 }, 1.15);
      enter(intro, "[data-hero=journey]", { y: 28 }, 0.15, { duration: 0.8 });
      enter(intro, "[data-hero=journey] .journey li", { x: -14 }, 0.55, { stagger: 0.08, duration: 0.45 });

      const reveal = (selector: string, vars: gsap.TweenVars) => {
        const targets = gsap.utils.toArray<HTMLElement>(selector, scope.current);
        if (!targets.length) return;
        gsap.set(targets, { opacity: 0, y: 32 });
        ScrollTrigger.batch(targets, {
          start: "top 88%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, stagger: 0.1, duration: 0.7, clearProps: "opacity,transform", ...vars }),
        });
      };
      reveal("[data-reveal=role]", {});
      reveal("[data-reveal=banner]", { duration: 0.8 });

      const metrics = scope.current?.querySelector(".metrics-grid");
      if (!metrics) return;
      return countUpAll(metrics.querySelectorAll(".metric-val"), {
        scrollTrigger: { trigger: metrics, start: "top 85%", once: true },
      });
    });
  }, { scope, dependencies: [signedIn], revertOnUpdate: true });
}

export default function Home() {
  const t = useTranslations("home");
  const f = useFormat();
  const locale = useAppLocale();
  const statusLabel = useStatusLabel();
  const { user, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean(user);
  const scope = useRef<HTMLDivElement>(null);
  useHomeAnimations(scope, isAuthenticated);
  useHeroShowpiece(scope, isAuthenticated, locale);

  return (
    <div className="page-stack" ref={scope}>
      <section className="hero">
        <div>
          {isAuthenticated && user ? (
            <>
              <div data-hero="badge" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547]" />
                {t("welcomeBack", { name: user.name, role: statusLabel(user.role) })}
              </div>
              {/* Keyed: the reveal rebuilds this markup, so a text change must mount a new h1. */}
              <h1 key={`signed-in-${locale}`} data-hero="title">
                <span className="hero-line">{t("signedInLine1")}</span>
                <span className="hero-line">{t("signedInLine2")}</span>
                <span className="hero-line hero-accent">{t("signedInLine3")}</span>
              </h1>
              <p data-hero="text">
                {t("signedInText", { role: t(`roleWord.${user.role}`) })}
              </p>
              <div className="actions" data-hero="actions">
                <ButtonLink href={roleHome(user.role)}>
                  {t(`openWorkspace.${user.role}`)} <ArrowUpRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                {user.role === "CUSTOMER" && (
                  <ButtonLink href="/customer/shipments/new" secondary>
                    {t("bookParcel")}
                  </ButtonLink>
                )}
                {user.role === "COURIER" && (
                  <ButtonLink href="/courier/shipments" secondary>
                    {t("viewDeliveries")}
                  </ButtonLink>
                )}
                {user.role === "ADMIN" && (
                  <ButtonLink href="/admin/shipments" secondary>
                    {t("fleetShipments")}
                  </ButtonLink>
                )}
              </div>
            </>
          ) : (
            <>
              <div data-hero="badge" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547] animate-pulse" />
                {t("badge")}
              </div>
              <h1 key={`signed-out-${locale}`} data-hero="title">
                <span className="hero-line">{t("line1")}</span>
                <span className="hero-line">{t("line2")}</span>
                <span className="hero-line hero-accent">{t("line3")}</span>
              </h1>
              <p data-hero="text">
                {t("intro")}
              </p>
              <div className="actions" data-hero="actions">
                <ButtonLink href="/register">{t("bookFirst")} <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="#how-it-works" secondary>
                  {t("howItWorks")}
                </ButtonLink>
              </div>
            </>
          )}
          <div data-hero="checks" className="flex items-center gap-6 mt-8 text-xs text-[#586b64] font-medium">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> {t("checkTracking")}
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> {t("checkStripe")}
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> {t("checkAudit")}
            </div>
          </div>
          <div data-hero="track" className="mt-8 max-w-xl rounded-2xl border border-ring/15 bg-white/70 p-4">
            <h2 className="mb-2 text-sm font-bold text-ring">{t("trackTitle")}</h2>
            <TrackForm compact />
          </div>
        </div>

        <div data-hero="journey" className="journey-card">
          <p className="eyebrow">{t("journeyEyebrow")}</p>
          <div className="journey-hero-stage">
            <div className="journey-hero-ambient" aria-hidden="true" />
            <div className="journey-hero-grid" aria-hidden="true" />
            <svg className="journey-route" viewBox="0 0 420 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <path d={ROUTE_PATH} />
              <circle className="journey-route-stop" cx="24" cy="196" r="6" />
              <circle className="journey-route-dest" cx={ROUTE_END.x} cy={ROUTE_END.y} r="8" />
              {/* The outer group holds the position; the inner one is what animates. */}
              <g transform="translate(318 82)">
                <g className="journey-route-chip">
                  {/* Sized for the text: "ডেলিভারি সম্পন্ন" is wider than "Delivered". */}
                  <rect x={locale === "bn" ? -54 : -40} y="-12" width={locale === "bn" ? 108 : 80} height="24" rx="12" />
                  <text x="0" y="4" textAnchor="middle">{t("deliveredChip")}</text>
                </g>
              </g>
              <g className="journey-route-parcel-group" transform={`translate(${ROUTE_END.x} ${ROUTE_END.y})`}>
                <rect className="journey-route-parcel" x="-7" y="-7" width="14" height="14" rx="3" />
              </g>
            </svg>
            <Image
              src="/delivery-hero.png"
              alt={t("heroImageAlt")}
              width={540}
              height={380}
              sizes="(max-width: 768px) 100vw, 420px"
              className="journey-hero-cutout"
              priority
            />
            <MotionFloat duration={3.2} yOffset={4}>
              <div className="journey-hero-badge" aria-hidden="true">
                <span className="journey-hero-pulse" />
                {t("liveBadge")}
              </div>
            </MotionFloat>
          </div>
          <h2>
            {t("journeyTitle1")}
            <br />
            {t("journeyTitle2")}
          </h2>
          <ol className="journey">
            <li>
              <span>{f.digits("01")}</span> {t("journeyStep1")}
            </li>
            <li>
              <span>{f.digits("02")}</span> {t("journeyStep2")}
            </li>
            <li>
              <span>{f.digits("03")}</span> {t("journeyStep3")}
            </li>
          </ol>
          <div className="actions">
            <StatusBadge status="IN_TRANSIT" />
            <span className="muted">{t("liveVerified")}</span>
          </div>
        </div>
      </section>

      {/* Interactive Live Journey Tracker Simulation */}
      <section id="how-it-works" className="scroll-mt-28" aria-label={t("howItWorksLabel")}>
        <InteractiveDeliveryTracker />
      </section>

      {/* Enterprise Metrics Section */}
      <section>
        <p className="eyebrow">{t("metricsEyebrow")}</p>
        <h2>{t("metricsTitle")}</h2>
        <div className="metrics-grid">
          <AnimatedMetricCard
            value={f.digits("99.98%")}
            label={t("metricOnTime")}
            subtext={t("metricOnTimeText")}
          />
          <AnimatedMetricCard
            value={f.digits("<250ms")}
            label={t("metricLatency")}
            subtext={t("metricLatencyText")}
          />
          <AnimatedMetricCard
            value={f.digits("100%")}
            label={t("metricStripe")}
            subtext={t("metricStripeText")}
          />
          <AnimatedMetricCard
            value={f.digits("29+")}
            label={t("metricEndpoints")}
            subtext={t("metricEndpointsText")}
          />
        </div>
      </section>

      {/* 3 Workspaces with 3D Generated Visuals */}
      <section>
        <p className="eyebrow">{t("rolesEyebrow")}</p>
        <h2>{t("rolesTitle")}</h2>
        <div className="grid-three">
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title={t("customerTitle")}
            text={t("customerText")}
            badge={user?.role === "CUSTOMER" ? t("yourWorkspace") : t("customerBadge")}
            imageSrc="/courier-customer.jpg"
            imageAlt={t("customerImageAlt")}
          />
          </div>
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title={t("courierTitle")}
            text={t("courierText")}
            badge={user?.role === "COURIER" ? t("yourWorkspace") : t("courierBadge")}
            imageSrc="/courier-workspace.jpg"
            imageAlt={t("courierImageAlt")}
          />
          </div>
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title={t("adminTitle")}
            text={t("adminText")}
            badge={user?.role === "ADMIN" ? t("yourWorkspace") : t("adminBadge")}
            imageSrc="/admin-center.jpg"
            imageAlt={t("adminImageAlt")}
          />
          </div>
        </div>
      </section>

      {/* Trust & Guarantee Banner */}
      <section
        data-reveal="banner"
        className="p-8 md:p-12 rounded-3xl bg-linear-to-r from-[#196547] to-[#104d35] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl"
      >
        {isAuthenticated && user ? (
          <>
            <div className="max-w-xl">
              <span className="text-[#d8ed99] text-xs font-bold uppercase tracking-widest">
                {t("activeSession", { role: statusLabel(user.role) })}
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-2 mb-3">
                {t("continueTitle")}
              </h2>
              <p className="text-[#e5ecdf] text-sm md:text-base leading-relaxed">
                {t("continueText")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 shrink-0">
              <ButtonLink href={roleHome(user.role)}>
                {t("goToWorkspace")} <ArrowUpRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-xl">
              <span className="text-[#d8ed99] text-xs font-bold uppercase tracking-widest">
                {t("securityEyebrow")}
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-2 mb-3">
                {t("ctaTitle")}
              </h2>
              <p className="text-[#e5ecdf] text-sm md:text-base leading-relaxed">
                {t("ctaText")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 shrink-0">
              <ButtonLink href="/register">{t("createAccount")} <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
