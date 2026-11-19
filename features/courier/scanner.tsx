"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Loader2, ScanLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import { SCAN_INTERVAL_MS, courierLookupPath, trackingNumberFromScan } from "./scan-contracts";

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;
type Decode = (frame: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

// Uses the browser's own QR reader where it exists (Chrome on Android) and loads jsQR
// otherwise. Frames are only read in this tab and never sent anywhere.
async function createDecoder(): Promise<Decode> {
  const Native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (frame) => (await detector.detect(frame))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  return async (frame, canvas) => {
    const width = frame.videoWidth;
    const height = frame.videoHeight;
    if (!width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(frame, 0, 0, width, height);
    return jsQR(context.getImageData(0, 0, width, height).data, width, height)?.data ?? null;
  };
}

type CameraState = "off" | "starting" | "scanning" | "denied" | "unavailable";

export function CourierScanner() {
  const { store } = useSession();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const looking = useRef(false);
  const [camera, setCamera] = useState<CameraState>("off");
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera((current) => (current === "scanning" || current === "starting" ? "off" : current));
  }

  async function lookUp(raw: string) {
    if (looking.current) return;
    const trackingNumber = trackingNumberFromScan(raw);
    if (!trackingNumber) {
      setStatus("That is not an ExpressHub tracking number or label.");
      return;
    }
    looking.current = true;
    setBusy(true);
    setStatus(`Looking up ${trackingNumber}…`);
    try {
      const { shipment } = await store.api.request<{ shipment: { id: string } }>(courierLookupPath(trackingNumber));
      stopCamera();
      setStatus("Parcel found. Opening the delivery…");
      router.push(`/courier/shipments/${encodeURIComponent(shipment.id)}`);
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 404
        ? `${trackingNumber} isn't assigned to you. Check the label or ask dispatch.`
        : errorMessage(error));
    } finally {
      looking.current = false;
      setBusy(false);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      setStatus("This browser can't use the camera. Type the tracking number instead.");
      return;
    }
    setCamera("starting");
    setStatus("Starting the camera…");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = media;
      const element = video.current;
      if (!element || !canvas.current) return;
      element.srcObject = media;
      await element.play();
      const decode = await createDecoder();
      setCamera("scanning");
      setStatus("Point the camera at the QR code on the label.");
      let last = 0;
      const tick = async (now: number) => {
        if (!stream.current) return;
        if (now - last >= SCAN_INTERVAL_MS && !looking.current) {
          last = now;
          const value = await decode(element, canvas.current!).catch(() => null);
          if (value) await lookUp(value);
        }
        if (stream.current) frame.current = requestAnimationFrame((time) => void tick(time));
      };
      frame.current = requestAnimationFrame((time) => void tick(time));
    } catch (error) {
      stopCamera();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setCamera(denied ? "denied" : "unavailable");
      setStatus(denied
        ? "Camera permission was refused. Allow it in the browser settings, or type the tracking number."
        : "No camera could be started. Type the tracking number instead.");
    }
  }

  // Never leave the camera running in the background or after leaving the page.
  useEffect(() => {
    const onHidden = () => { if (document.hidden) stopCamera(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      stopCamera();
    };
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void lookUp(manual);
  }

  const scanning = camera === "scanning" || camera === "starting";

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">On the road</p>
          <h1>Scan parcel</h1>
          <p>Scan the QR code on a shipping label to open that delivery.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanLine className="size-5" aria-hidden="true" />Camera</CardTitle>
          <CardDescription>The camera image stays on this phone; only the tracking number is looked up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-muted">
            <video ref={video} className={`size-full object-cover ${scanning ? "" : "hidden"}`} muted playsInline aria-label="Camera preview" />
            {!scanning && (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <CameraOff className="size-8" aria-hidden="true" />
                Camera is off
              </div>
            )}
            {camera === "scanning" && <div className="pointer-events-none absolute inset-10 rounded-lg border-2 border-white/80" aria-hidden="true" />}
          </div>
          <canvas ref={canvas} className="hidden" aria-hidden="true" />
          <div className="flex flex-wrap justify-center gap-2">
            {scanning ? (
              <Button type="button" variant="outline" size="lg" onClick={stopCamera}><CameraOff aria-hidden="true" />Stop camera</Button>
            ) : (
              <Button type="button" size="lg" onClick={() => void startCamera()} disabled={busy}><Camera aria-hidden="true" />Start camera</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type the tracking number</CardTitle>
          <CardDescription>Use this if the label is damaged or the camera isn&apos;t available.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="scan-tracking-number">Tracking number</Label>
              <Input
                id="scan-tracking-number"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="EH-0123456789ABCDEF01234567"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </div>
            <Button type="submit" size="lg" disabled={busy || !manual.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              Open delivery
            </Button>
          </form>
        </CardContent>
      </Card>

      <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
