"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  // Shown in the marker's tooltip and used as its accessible name.
  label: string;
  // Rounded public positions are drawn with a circle so nobody reads them as exact.
  approximateRadiusM?: number;
  href?: string;
};

type Props = {
  markers: MapMarker[];
  label: string;
  className?: string;
};

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors';
const DHAKA: L.LatLngTuple = [23.8103, 90.4125];
const MOVE_MS = 1_200;

// An inline SVG truck: Leaflet's default marker images break under bundlers, and an
// inline icon needs no extra image request.
const truckIcon = L.divIcon({
  className: "courier-marker",
  html: `<span class="courier-marker-dot" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Entry = { marker: L.Marker; circle?: L.Circle; frame?: number };

// Glides a marker to its new position so live updates read as movement, not jumps.
function moveTo(entry: Entry, to: L.LatLng) {
  if (entry.frame) cancelAnimationFrame(entry.frame);
  const from = entry.marker.getLatLng();
  if (prefersReducedMotion() || from.equals(to)) {
    entry.marker.setLatLng(to);
    entry.circle?.setLatLng(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / MOVE_MS);
    const eased = 1 - (1 - t) ** 3;
    const point = L.latLng(from.lat + (to.lat - from.lat) * eased, from.lng + (to.lng - from.lng) * eased);
    entry.marker.setLatLng(point);
    entry.circle?.setLatLng(point);
    entry.frame = t < 1 ? requestAnimationFrame(step) : undefined;
  };
  entry.frame = requestAnimationFrame(step);
}

export default function CourierMap({ markers, label, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const entries = useRef(new Map<string, Entry>());
  const fitted = useRef(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, {
      center: DHAKA,
      zoom: 13,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    // OSM tile policy: attribution shown, normal browsing only, no bulk prefetching.
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, crossOrigin: true }).addTo(instance);
    map.current = instance;
    const current = entries.current;
    return () => {
      current.forEach((entry) => entry.frame && cancelAnimationFrame(entry.frame));
      current.clear();
      instance.remove();
      map.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const seen = new Set<string>();
    for (const item of markers) {
      seen.add(item.id);
      const position = L.latLng(item.lat, item.lng);
      let entry = entries.current.get(item.id);
      if (!entry) {
        const marker = L.marker(position, { icon: truckIcon, title: item.label, alt: item.label, keyboard: Boolean(item.href) });
        marker.bindTooltip(item.label, { direction: "top", offset: [0, -16] });
        if (item.href) {
          const href = item.href;
          marker.on("click keypress", () => window.location.assign(href));
        }
        marker.addTo(instance);
        const circle = item.approximateRadiusM
          ? L.circle(position, { radius: item.approximateRadiusM, color: "#1f7a5a", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(instance)
          : undefined;
        entry = { marker, circle };
        entries.current.set(item.id, entry);
      } else {
        entry.marker.setTooltipContent(item.label);
        moveTo(entry, position);
      }
    }
    for (const [id, entry] of entries.current) {
      if (seen.has(id)) continue;
      if (entry.frame) cancelAnimationFrame(entry.frame);
      entry.marker.remove();
      entry.circle?.remove();
      entries.current.delete(id);
    }
    // Frame the markers once; later updates keep the viewer's own pan and zoom.
    if (!fitted.current && markers.length) {
      fitted.current = true;
      if (markers.length === 1) instance.setView([markers[0].lat, markers[0].lng], 15);
      else instance.fitBounds(L.latLngBounds(markers.map((item) => [item.lat, item.lng] as L.LatLngTuple)), { padding: [32, 32], maxZoom: 15 });
    }
  }, [markers]);

  return <div ref={container} role="region" aria-label={label} className={className ?? "courier-map"} />;
}
