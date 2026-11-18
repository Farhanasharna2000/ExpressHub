"use client";

import { ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
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

// The delivery route drawn behind the courier. The parcel marker's resting position is
// the path's end point, so without JavaScript or with reduced motion it sits at the destination.
const ROUTE_PATH = "M 24 196 C 96 128, 150 214, 226 132 S 352 70, 396 34";
const ROUTE_END = { x: 396, y: 34 };

// Entrances always state their end values. A from() tween reads the end from computed
// styles, which is wrong mid CSS transition (buttons animate opacity) or when the setup
// runs again before a revert has settled, leaving elements stuck transparent.
function enter(timeline: gsap.core.Timeline, targets: string, offset: gsap.TweenVars, position: gsap.Position, vars: gsap.TweenVars = {}) {
  timeline.fromTo(targets, { opacity: 0, x: 0, y: 0, ...offset }, { opacity: 1, x: 0, y: 0, clearProps: "opacity,transform", ...vars }, position);
}

function useHomeAnimations(scope: React.RefObject<HTMLDivElement | null>, signedIn: boolean) {
  useGSAP(() => {
    whenMotionAllowed(() => {
      const intro = gsap.timeline({ defaults: { duration: 0.7, ease: "power3.out" } });
      enter(intro, "[data-hero=badge]", { y: 14 }, 0, { duration: 0.5 });
      enter(intro, "[data-hero=title] .hero-line", { y: 36 }, "-=0.25", { stagger: 0.1 });
      enter(intro, "[data-hero=text]", { y: 18 }, "-=0.45");
      enter(intro, "[data-hero=actions] > *", { y: 14 }, "-=0.45", { stagger: 0.08, duration: 0.5 });
      enter(intro, "[data-hero=checks] > *", { y: 10 }, "-=0.3", { stagger: 0.06, duration: 0.4 });
      enter(intro, "[data-hero=track]", { y: 16 }, "-=0.35");
      enter(intro, "[data-hero=journey]", { y: 28 }, 0.15, { duration: 0.8 });
      enter(intro, "[data-hero=journey] .journey li", { x: -14 }, 0.55, { stagger: 0.08, duration: 0.45 });

      const route = scope.current?.querySelector<SVGPathElement>(".journey-route path");
      const parcel = scope.current?.querySelector<SVGGElement>(".journey-route-parcel-group");
      if (route && parcel) {
        const length = route.getTotalLength();
        const draw = { progress: 0 };
        const place = () => {
          const point = route.getPointAtLength(length * draw.progress);
          parcel.setAttribute("transform", `translate(${point.x} ${point.y})`);
        };
        gsap.set(route, { strokeDasharray: length, strokeDashoffset: length });
        place();
        intro.to(draw, {
          progress: 1,
          duration: 1.6,
          ease: "power2.inOut",
          onUpdate() {
            route.style.strokeDashoffset = String(length * (1 - draw.progress));
            place();
          },
          onComplete() {
            gsap.set(route, { clearProps: "strokeDasharray,strokeDashoffset" });
            parcel.setAttribute("transform", `translate(${ROUTE_END.x} ${ROUTE_END.y})`);
          },
        }, 0.6);
      }

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
  const { user, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean(user);
  const scope = useRef<HTMLDivElement>(null);
  useHomeAnimations(scope, isAuthenticated);

  return (
    <div className="page-stack" ref={scope}>
      <section className="hero">
        <div>
          {isAuthenticated && user ? (
            <>
              <div data-hero="badge" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547]" />
                Welcome back, {user.name} • {user.role}
              </div>
              <h1 data-hero="title">
                <span className="hero-line">Your parcels.</span>
                <span className="hero-line">Your route.</span>
                <span className="hero-line hero-accent">Always in sync.</span>
              </h1>
              <p data-hero="text">
                Signed in as an active {user.role.toLowerCase()}. Jump straight into your workspace to book parcels, track live milestone transitions, or monitor logistics telemetry.
              </p>
              <div className="actions" data-hero="actions">
                <ButtonLink href={roleHome(user.role)}>
                  Open {user.role === "ADMIN" ? "Command Center" : user.role === "COURIER" ? "Courier Portal" : "Customer Workspace"} <ArrowUpRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                {user.role === "CUSTOMER" && (
                  <ButtonLink href="/customer/shipments/new" secondary>
                    Book a parcel
                  </ButtonLink>
                )}
                {user.role === "COURIER" && (
                  <ButtonLink href="/courier/shipments" secondary>
                    View deliveries
                  </ButtonLink>
                )}
                {user.role === "ADMIN" && (
                  <ButtonLink href="/admin/shipments" secondary>
                    Fleet shipments
                  </ButtonLink>
                )}
              </div>
            </>
          ) : (
            <>
              <div data-hero="badge" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547] animate-pulse" />
                Next-Gen Express Logistics
              </div>
              <h1 data-hero="title">
                <span className="hero-line">Big plans.</span>
                <span className="hero-line">Small parcels.</span>
                <span className="hero-line hero-accent">All connected.</span>
              </h1>
              <p data-hero="text">
                A simpler, modern way to move what matters. Bring your bookings,
                real-time tracking, Stripe-verified payments, and courier operations
                together in one unified platform.
              </p>
              <div className="actions" data-hero="actions">
                <ButtonLink href="/register">Book your first parcel <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="#how-it-works" secondary>
                  How it works
                </ButtonLink>
              </div>
            </>
          )}
          <div data-hero="checks" className="flex items-center gap-6 mt-8 text-xs text-[#586b64] font-medium">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> Real-Time Tracking
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> Stripe Checkout
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-[#196547]" aria-hidden="true" /> Full Audit Trails
            </div>
          </div>
          <div data-hero="track" className="mt-8 max-w-xl rounded-2xl border border-ring/15 bg-white/70 p-4">
            <h2 className="mb-2 text-sm font-bold text-ring">Track a parcel</h2>
            <TrackForm compact />
          </div>
        </div>

        <div data-hero="journey" className="journey-card">
          <p className="eyebrow">The delivery journey</p>
          <div className="journey-hero-stage">
            <div className="journey-hero-ambient" aria-hidden="true" />
            <svg className="journey-route" viewBox="0 0 420 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <path d={ROUTE_PATH} />
              <circle className="journey-route-stop" cx="24" cy="196" r="6" />
              <g className="journey-route-parcel-group" transform={`translate(${ROUTE_END.x} ${ROUTE_END.y})`}>
                <rect className="journey-route-parcel" x="-7" y="-7" width="14" height="14" rx="3" />
              </g>
            </svg>
            <Image
              src="/delivery-hero.png"
              alt="ExpressHub courier holding a package and clipboard"
              width={540}
              height={380}
              sizes="(max-width: 768px) 100vw, 420px"
              className="journey-hero-cutout"
              priority
            />
            <MotionFloat duration={3.2} yOffset={4}>
              <div className="journey-hero-badge" aria-hidden="true">
                <span className="journey-hero-pulse" />
                Live Express Courier
              </div>
            </MotionFloat>
          </div>
          <h2>
            From your doorstep
            <br />
            to theirs.
          </h2>
          <ol className="journey">
            <li>
              <span>01</span> Book with your parcel weight
            </li>
            <li>
              <span>02</span> Pay securely with Stripe Checkout
            </li>
            <li>
              <span>03</span> Follow real-time milestone transitions
            </li>
          </ol>
          <div className="actions">
            <StatusBadge status="IN_TRANSIT" />
            <span className="muted">Live verified status</span>
          </div>
        </div>
      </section>

      {/* Interactive Live Journey Tracker Simulation */}
      <section id="how-it-works" className="scroll-mt-28" aria-label="How delivery works">
        <InteractiveDeliveryTracker />
      </section>

      {/* Enterprise Metrics Section */}
      <section>
        <p className="eyebrow">Performance & Reliability</p>
        <h2>Engineered for modern enterprise logistics.</h2>
        <div className="metrics-grid">
          <AnimatedMetricCard
            value="99.98%"
            label="On-Time Delivery"
            subtext="Guaranteed parcel routing SLAs"
          />
          <AnimatedMetricCard
            value="<250ms"
            label="API Latency"
            subtext="Optimized PostgreSQL queries"
          />
          <AnimatedMetricCard
            value="100%"
            label="Stripe Verified"
            subtext="Cryptographic webhook verification"
          />
          <AnimatedMetricCard
            value="29+"
            label="REST Endpoints"
            subtext="Strict OpenAPI 3.0 contract"
          />
        </div>
      </section>

      {/* 3 Workspaces with 3D Generated Visuals */}
      <section>
        <p className="eyebrow">One platform. Three perspectives.</p>
        <h2>A purpose built workspace for every role.</h2>
        <div className="grid-three">
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title="Customer Workspace"
            text="Get weight-based shipping quotes, book doorstep pickups, complete instant Stripe checkout, and follow chronological event timelines."
            badge={user?.role === "CUSTOMER" ? "Your Active Workspace" : "Customer Experience"}
            imageSrc="/courier-customer.jpg"
            imageAlt="3D illustration of customer booking parcel on mobile device"
          />
          </div>
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title="Courier Workspace"
            text="Access assigned delivery batches, execute status progressions from pickup to proof of delivery, and submit mandatory transit notes."
            badge={user?.role === "COURIER" ? "Your Active Workspace" : "Courier Operations"}
            imageSrc="/courier-workspace.jpg"
            imageAlt="3D illustration of express courier van in transit"
          />
          </div>
          <div data-reveal="role" className="flex [&>*]:w-full">
          <FeatureCardWithImage
            title="Admin Command Center"
            text="Assign couriers with optimistic concurrency protection, monitor fleet telemetry, manage user access, and inspect immutable audit logs."
            badge={user?.role === "ADMIN" ? "Your Active Workspace" : "Operations & Control"}
            imageSrc="/admin-center.jpg"
            imageAlt="3D illustration of logistics operations analytics command center"
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
                Active Session • {user.role}
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-2 mb-3">
                Ready to continue your logistics operations?
              </h2>
              <p className="text-[#e5ecdf] text-sm md:text-base leading-relaxed">
                Your account is active. Jump directly into your dedicated workspace to book deliveries, execute milestone status progressions, or update your profile.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 shrink-0">
              <ButtonLink href={roleHome(user.role)}>
                Go to your workspace <ArrowUpRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-xl">
              <span className="text-[#d8ed99] text-xs font-bold uppercase tracking-widest">
                Security & Compliance
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-2 mb-3">
                Ready to experience frictionless parcel logistics?
              </h2>
              <p className="text-[#e5ecdf] text-sm md:text-base leading-relaxed">
                Create an account in seconds. Book your first parcel, test the
                milestone delivery lifecycle, and track updates in real time with
                enterprise-grade security.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 shrink-0">
              <ButtonLink href="/register">Create an account <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
