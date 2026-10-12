"use client";

import { ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import { ButtonLink, StatusBadge } from "@/components/ui/primitives";
import {
  MotionContainer,
  MotionStaggerGroup,
  MotionStaggerItem,
  MotionFloat,
  InteractiveDeliveryTracker,
  AnimatedMetricCard,
  FeatureCardWithImage,
} from "@/components/ui/motion";
import { motion } from "framer-motion";
import { useSession } from "@/features/auth/provider";
import { roleHome } from "@/features/auth/session";

export default function Home() {
  const { user, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean(user);

  return (
    <div className="page-stack">
      {/* Hero Section with Framer Motion Orchestration */}
      <section className="hero">
        <MotionContainer delay={0.1}>
          {isAuthenticated && user ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547]" />
                Welcome back, {user.name} • {user.role}
              </div>
              <h1>
                Your parcels.
                <br />
                Your route.
                <br />
                <span>Always in sync.</span>
              </h1>
              <p>
                Signed in as an active {user.role.toLowerCase()}. Jump straight into your workspace to book parcels, track live milestone transitions, or monitor logistics telemetry.
              </p>
              <div className="actions">
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
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5ecdf] text-[#196547] text-xs font-bold tracking-wider uppercase mb-5 border border-[#196547]/15">
                <span className="w-2 h-2 rounded-full bg-[#196547] animate-pulse" />
                Next-Gen Express Logistics
              </div>
              <h1>
                Big plans.
                <br />
                Small parcels.
                <br />
                <span>All connected.</span>
              </h1>
              <p>
                A simpler, modern way to move what matters. Bring your bookings,
                real-time tracking, Stripe-verified payments, and courier operations
                together in one unified platform.
              </p>
              <div className="actions">
                <ButtonLink href="/register">Get started <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="/login" secondary>
                  Sign in
                </ButtonLink>
              </div>
            </>
          )}
          <div className="flex items-center gap-6 mt-8 text-xs text-[#586b64] font-medium">
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
        </MotionContainer>

        <MotionContainer delay={0.25} className="journey-card">
          <p className="eyebrow">The delivery journey</p>
          <div className="journey-hero-stage">
            <div className="journey-hero-ambient" aria-hidden="true" />
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
              <span>01</span> Book with volumetric parcel dimensions
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
        </MotionContainer>
      </section>

      {/* Interactive Live Journey Tracker Simulation */}
      <section>
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
        <MotionStaggerGroup className="grid-three">
          <FeatureCardWithImage
            title="Customer Workspace"
            text="Calculate dimensional shipping quotes, book doorstep pickups, complete instant Stripe checkout, and follow chronological event timelines."
            badge={user?.role === "CUSTOMER" ? "Your Active Workspace" : "Customer Experience"}
            imageSrc="/courier-customer.jpg"
            imageAlt="3D illustration of customer booking parcel on mobile device"
            href="/customer"
            linkText={user?.role === "CUSTOMER" ? "Go to your Portal " : "Explore Customer Portal"}
          />
          <FeatureCardWithImage
            title="Courier Workspace"
            text="Access assigned delivery batches, execute status progressions from pickup to proof of delivery, and submit mandatory transit notes."
            badge={user?.role === "COURIER" ? "Your Active Workspace" : "Courier Operations"}
            imageSrc="/courier-workspace.jpg"
            imageAlt="3D illustration of express courier van in transit"
            href="/courier"
            linkText={user?.role === "COURIER" ? "Go to your Dashboard" : "Open Courier Dashboard"}
          />
          <FeatureCardWithImage
            title="Admin Command Center"
            text="Assign couriers with optimistic concurrency protection, monitor fleet telemetry, manage user access, and inspect immutable audit logs."
            badge={user?.role === "ADMIN" ? "Your Active Workspace" : "Operations & Control"}
            imageSrc="/admin-center.jpg"
            imageAlt="3D illustration of logistics operations analytics command center"
            href="/admin"
            linkText={user?.role === "ADMIN" ? "Go to Command Center" : "Enter Admin Center"}
          />
        </MotionStaggerGroup>
      </section>

      {/* Trust & Guarantee Banner */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
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
              <ButtonLink href="/register">Create Free Account <ArrowUpRight className="size-4" aria-hidden="true" /></ButtonLink>
              <ButtonLink href="/login" secondary>
                Sign In Now
              </ButtonLink>
            </div>
          </>
        )}
      </motion.section>
    </div>
  );
}
