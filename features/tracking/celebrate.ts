import { gsap } from "@/lib/gsap";

const COLORS = ["#2f7d5b", "#e0a526", "#2563eb", "#e5484d", "#7c3aed", "#0ea5a4"];

// One-off confetti burst for a delivered parcel. Pieces are plain elements removed when they
// finish, so nothing lingers in the DOM. Call it only inside whenMotionAllowed: with reduced
// motion there is no burst at all. Returns a function that removes any pieces still in flight.
export function confettiBurst(host: HTMLElement, origin: { x: number; y: number }, count = 36) {
  const pieces: HTMLElement[] = [];
  for (let index = 0; index < count; index++) {
    const piece = document.createElement("i");
    piece.setAttribute("data-confetti", "");
    piece.setAttribute("aria-hidden", "true");
    const size = 5 + Math.random() * 5;
    Object.assign(piece.style, {
      position: "absolute", left: `${origin.x}px`, top: `${origin.y}px`, width: `${size}px`, height: `${size * 0.45}px`,
      background: COLORS[index % COLORS.length], borderRadius: "1px", pointerEvents: "none", opacity: "0",
    });
    host.appendChild(piece);
    pieces.push(piece);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const power = 70 + Math.random() * 110;
    const timeline = gsap.timeline({ onComplete: () => piece.remove() });
    timeline
      .set(piece, { opacity: 1, rotation: Math.random() * 360 })
      .to(piece, { x: Math.cos(angle) * power, y: Math.sin(angle) * power, rotation: `+=${(Math.random() - 0.5) * 540}`, duration: 0.55, ease: "power2.out" })
      .to(piece, { y: `+=${90 + Math.random() * 70}`, x: `+=${(Math.random() - 0.5) * 50}`, rotation: `+=${(Math.random() - 0.5) * 360}`, opacity: 0, duration: 0.9, ease: "power1.in" });
  }
  return () => {
    gsap.killTweensOf(pieces);
    pieces.forEach((piece) => piece.remove());
  };
}
