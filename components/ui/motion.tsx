"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";

import { Pause, Play, Check, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/primitives";
import type { ShipmentStatus } from "@/types/api";

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

const TRACKER_STATUSES = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const satisfies readonly ShipmentStatus[];

export function InteractiveDeliveryTracker() {
  const t = useTranslations("tracker");
  const f = useFormat();
  const TRACKER_STEPS = TRACKER_STATUSES.map((status) => ({
    status,
    label: t(`steps.${status}.label`),
    sub: t(`steps.${status}.sub`),
    eta: t(`steps.${status}.eta`),
    note: t(`steps.${status}.note`),
  }));
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
          <span className="eyebrow">{t("eyebrow")}</span>
          <h3 className="tracker-title">{t("title")}</h3>
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
            {isPlaying ? <Pause className="inline size-4" aria-hidden="true" /> : <Play className="inline size-4" aria-hidden="true" />} {isPlaying ? t("pause") : t("play")}
          </button>
        </div>
      </div>

      <div className="tracker-meta-banner">
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">{t("liveStatus")}</span>
          <div className="tracker-badge-wrap">
            <StatusBadge status={current.status} />
          </div>
        </div>
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">{t("estimatedDelivery")}</span>
          <span className="tracker-meta-val">{current.eta}</span>
        </div>
        <div className="tracker-meta-col">
          <span className="tracker-meta-label">{t("trackingNumber")}</span>
          <span className="tracker-meta-val font-mono">{f.digits("EH-784920-BD")}</span>
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
              {t("verifiedMilestone")}
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
  href?: string;
  linkText?: string;
  objectPosition?: string;
}) {
  return (
    <motion.div
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
        {href && linkText ? (
          <Link href={href} className="feature-card-link">
            {linkText} <ArrowRight className="inline size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}
