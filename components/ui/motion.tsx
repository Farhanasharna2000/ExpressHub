"use client";

import { Pause, Play, Check, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/primitives";
import type { ShipmentStatus } from "@/types/api";

export function MotionContainer({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerGroup({
  children,
  className = "",
  staggerDelay = 0.08,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 22 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6, transition: { duration: 0.22, ease: "easeOut" } }}
      whileTap={{ scale: 0.99 }}
      className={`card motion-card ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function MotionFloat({
  children,
  className = "",
  duration = 4,
  yOffset = 8,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
  yOffset?: number;
}) {
  return (
    <motion.div
      animate={{ y: [-yOffset, yOffset, -yOffset] }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const TRACKER_STEPS: Array<{
  status: ShipmentStatus;
  label: string;
  sub: string;
  eta: string;
  note: string;
}> = [
  {
    status: "CREATED",
    label: "Shipment Booked",
    sub: "Sender doorstep pickup scheduled",
    eta: "Ready for pickup",
    note: "Volume quote computed and parcel registered in hub queue.",
  },
  {
    status: "PICKED_UP",
    label: "Picked Up by Courier",
    sub: "Assigned courier verified package barcode",
    eta: "Estimated 24h",
    note: "Courier collected parcel from sender address.",
  },
  {
    status: "IN_TRANSIT",
    label: "In Transit Across Hubs",
    sub: "Moving along central logistics express corridor",
    eta: "Estimated 12h",
    note: "Processed through central distribution hub with tamper seals intact.",
  },
  {
    status: "OUT_FOR_DELIVERY",
    label: "Out for Final Delivery",
    sub: "Courier is in recipient neighborhood",
    eta: "Estimated 45 mins",
    note: "Courier on final route. Recipient contact confirmed.",
  },
  {
    status: "DELIVERED",
    label: "Delivered & Verified",
    sub: "Signed with recipient confirmation proof",
    eta: "Completed",
    note: "Delivered to recipient with digital proof of delivery.",
  },
];

export function InteractiveDeliveryTracker() {
  const [activeStep, setActiveStep] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= TRACKER_STEPS.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2400);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const current = TRACKER_STEPS[activeStep];
  const progressPercent = (activeStep / (TRACKER_STEPS.length - 1)) * 100;

  return (
    <div className="tracker-stage-wrapper">
      <div className="tracker-header">
        <div>
          <span className="eyebrow">Real-Time Simulation</span>
          <h3 className="tracker-title">Interactive Journey Tracker</h3>
        </div>
        <div className="tracker-controls">
          <button
            type="button"
            className="tracker-play-btn"
            onClick={() => {
              if (activeStep >= TRACKER_STEPS.length - 1) {
                setActiveStep(0);
              }
              setIsPlaying(!isPlaying);
            }}
          >
            {isPlaying ? <Pause className="inline size-4" aria-hidden="true" /> : <Play className="inline size-4" aria-hidden="true" />} {isPlaying ? "Pause Demo" : "Simulate Journey"}
          </button>
        </div>
      </div>

      <div className="tracker-meta-banner">
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">Live Status</span>
          <div className="tracker-badge-wrap">
            <StatusBadge status={current.status} />
          </div>
        </div>
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">Estimated Delivery</span>
          <span className="tracker-meta-val">{current.eta}</span>
        </div>
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">Tracking Number</span>
          <span className="tracker-meta-val font-mono">EH-784920-BD</span>
        </div>
      </div>

      {/* Animated Progress Bar */}
      <div className="tracker-progress-track">
        <motion.div
          className="tracker-progress-fill"
          initial={false}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="tracker-van-marker"
          initial={false}
          animate={{ left: `${progressPercent}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="tracker-van-icon" aria-hidden="true">
            <span className="inline-block -scale-x-100">🚚</span>
          </span>
        </motion.div>
      </div>

      {/* Stepper Dots */}
      <div className="tracker-steps-grid">
        {TRACKER_STEPS.map((step, idx) => {
          const isDone = idx <= activeStep;
          const isCurrent = idx === activeStep;
          return (
            <button
              key={step.status}
              type="button"
              className={`tracker-step-node ${isCurrent ? "is-current" : ""} ${
                isDone ? "is-done" : ""
              }`}
              onClick={() => {
                setIsPlaying(false);
                setActiveStep(idx);
              }}
            >
              <div className="tracker-node-indicator">
                {isDone ? (
                  <span className="tracker-check"><Check className="size-4" aria-hidden="true" /></span>
                ) : (
                  <span>0{idx + 1}</span>
                )}
              </div>
              <span className="tracker-node-label">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step Details Box with Animated Transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="tracker-detail-card"
        >
          <div className="tracker-detail-left">
            <span className="tracker-detail-status">{current.label}</span>
            <p className="tracker-detail-sub">{current.sub}</p>
            <p className="tracker-detail-note">{current.note}</p>
          </div>
          <div className="tracker-detail-right">
            <div className="tracker-hub-badge">
              <span className="tracker-pulse-dot" />
              Verified Hub Milestone
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function AnimatedMetricCard({
  value,
  label,
  subtext,
}: {
  value: string;
  label: string;
  subtext: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="metric-card"
    >
      <div className="metric-val">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-sub">{subtext}</div>
    </motion.div>
  );
}

export function FeatureCardWithImage({
  title,
  text,
  badge,
  imageSrc,
  imageAlt,
  href,
  linkText,
  objectPosition = "center top",
}: {
  title: string;
  text: string;
  badge: string;
  imageSrc: string;
  imageAlt: string;
  href: string;
  linkText: string;
  objectPosition?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
        },
      }}
      whileHover={{ y: -8, transition: { duration: 0.25, ease: "easeOut" } }}
      className="feature-perspective-card"
    >
      <div className="feature-card-image-wrap">
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={480}
          height={320}
          className="feature-card-img"
          style={{ objectPosition: objectPosition ?? "center top" }}
        />
        <div className="feature-card-badge">{badge}</div>
      </div>
      <div className="feature-card-body">
        <h3>{title}</h3>
        <p>{text}</p>
        <Link href={href} className="feature-card-link">
          {linkText} <ArrowRight className="inline size-4" aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}
