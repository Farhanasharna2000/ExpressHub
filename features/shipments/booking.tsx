"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Package, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/primitives";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage, fieldErrors } from "@/lib/client/api";
import { bookingPayload, bookingSchema, pickupFields, deliveryFields, parcelFields, emptyDraft, dateTime, type BookingDraft, type Shipment } from "./contracts";
import { useRetryDelay } from "./use-resource";

const steps = ["Pickup", "Delivery", "Parcel", "Review"];
const fieldStep = (key: string) => key.startsWith("pickup") && key !== "pickupScheduledAt" ? 0 : key.startsWith("delivery") ? 1 : 2;

export function ShipmentBooking() {
  const { store } = useSession();
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);
  const delay = useRetryDelay(error);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [step]);

  function input(key: keyof BookingDraft, label: string, options: { type?: string; maxLength?: number; hint?: string; min?: string; max?: string; step?: string; required?: boolean } = {}) {
    return <Input id={key} name={key} label={label} value={draft[key]} onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))} error={errors[key]} disabled={busy || uncertain} {...options} />;
  }
  function report(failure: unknown) {
    setError(failure);
    const mapped = fieldErrors(failure); setErrors(mapped);
    const first = Object.keys(mapped)[0];
    if (first) setStep(fieldStep(first));
    requestAnimationFrame(() => {
      const target = first ? formRef.current?.elements.namedItem(first) : formRef.current?.querySelector("[data-booking-error]");
      if (target instanceof HTMLElement) target.focus();
    });
  }
  function validate() {
    let payload;
    try { payload = bookingPayload(draft); }
    catch (error) { throw new ApiError(400, "Check the pickup time.", [{ path: "pickupScheduledAt", message: error instanceof Error ? error.message : "Invalid date" }]); }
    const result = (step === 0 ? pickupFields : step === 1 ? deliveryFields : step === 2 ? parcelFields : bookingSchema).safeParse(step < 2 ? draft : payload);
    if (!result.success) throw new ApiError(400, "Check the highlighted fields.", result.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })));
    return result.data;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uncertain || delay) return;
    setError(null); setErrors({});
    try {
      validate();
      if (step < 3) { setStep(step + 1); return; }
      const payload = bookingSchema.parse(bookingPayload(draft));
      submitting.current = true; setBusy(true);
      const { shipment } = await store.api.request<{ shipment: Shipment }>("/shipments", { method: "POST", body: payload });
      // Keep submission locked through navigation; the server is the source of price and currency.
      router.replace(`/customer/shipments/${encodeURIComponent(shipment.id)}`);
    } catch (failure) {
      if (submitting.current && (!(failure instanceof ApiError) || failure.status === 0 || failure.status >= 500)) setUncertain(true);
      submitting.current = false; setBusy(false); report(failure);
    }
  }

  return <div className="page-stack">
    <Link href="/customer/shipments" className="back-link">← My shipments</Link>
    <div className="page-heading"><div><p className="eyebrow">Make your next move</p><h1>Book a shipment</h1><p>A few details to get your parcel on its way.</p></div><Package aria-hidden="true" className="size-9 text-primary" /></div>
    <ol className="shipment-steps" aria-label="Booking progress">{steps.map((name, index) => <li key={name} aria-current={step === index ? "step" : undefined}><span>{index < step ? <Check className="size-4" aria-hidden="true" /> : index + 1}</span>{name}</li>)}</ol>
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} className="booking-layout">
      <Card><CardHeader><CardTitle><h2 ref={heading} tabIndex={-1}>{["Where should we pick up?", "Where is it going?", "Tell us about your parcel", "Review your shipment"][step]}</h2></CardTitle><CardDescription>{["Add the sender’s contact details and pickup address.", "Add the recipient’s contact details and full delivery address.", "Use kilograms for weight and centimeters for dimensions.", "Check the details below before creating your shipment."][step]}</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          {!!error && <Alert variant="destructive" tabIndex={-1} data-booking-error><AlertTitle>{uncertain ? "Check your shipments before booking again" : "We couldn’t complete that request"}</AlertTitle><AlertDescription>{uncertain ? "We couldn’t confirm whether this shipment was created. Check your shipment list first to avoid a duplicate booking." : errorMessage(error)}{delay > 0 && <span role="status">Try again in {delay} seconds.</span>}{uncertain && <Button asChild variant="outline"><Link href="/customer/shipments">Check my shipments</Link></Button>}</AlertDescription></Alert>}
          {step === 0 && <div className="form-grid">{input("pickupContactName", "Pickup contact name", { required: true, maxLength: 100 })}{input("pickupContactPhone", "Pickup phone", { type: "tel", required: true, maxLength: 30 })}{input("pickupAddress", "Pickup address", { required: true, maxLength: 500, hint: "Include building, street, area, and city." })}</div>}
          {step === 1 && <div className="form-grid">{input("deliveryContactName", "Recipient name", { required: true, maxLength: 100 })}{input("deliveryContactPhone", "Recipient phone", { type: "tel", required: true, maxLength: 30 })}{input("deliveryAddress", "Delivery address", { required: true, maxLength: 500, hint: "Include building, street, area, and city." })}</div>}
          {step === 2 && <div className="form-grid">{input("parcelWeightKg", "Weight (kg)", { type: "number", required: true, min: "0.001", max: "9999999.999", step: "0.001" })}{input("packageDescription", "Parcel description (optional)", { maxLength: 1000 })}<fieldset><legend className="text-sm font-medium mb-3">Dimensions (optional — provide all three)</legend><div className="shipment-dimensions">{input("parcelLengthCm", "Length (cm)", { type: "number", min: "0.01", max: "99999999.99", step: "0.01" })}{input("parcelWidthCm", "Width (cm)", { type: "number", min: "0.01", max: "99999999.99", step: "0.01" })}{input("parcelHeightCm", "Height (cm)", { type: "number", min: "0.01", max: "99999999.99", step: "0.01" })}</div></fieldset>{input("pickupScheduledAt", "Preferred pickup time (optional)", { type: "datetime-local", hint: `Choose a future time in your device timezone: ${timezone}.` })}</div>}
          {step === 3 && <div className="space-y-6"><ReviewAddress title="Pickup" name={draft.pickupContactName} phone={draft.pickupContactPhone} address={draft.pickupAddress} /><ReviewAddress title="Delivery" name={draft.deliveryContactName} phone={draft.deliveryContactPhone} address={draft.deliveryAddress} /><div><h3>Parcel</h3><p>{draft.parcelWeightKg} kg{draft.parcelLengthCm && ` · ${draft.parcelLengthCm} × ${draft.parcelWidthCm} × ${draft.parcelHeightCm} cm`}</p>{draft.packageDescription && <p className="break-words">{draft.packageDescription}</p>}<p>{draft.pickupScheduledAt ? `${dateTime(new Date(draft.pickupScheduledAt).toISOString())} (${timezone})` : "No preferred pickup time"}</p></div></div>}
          <div className="flex flex-wrap justify-between gap-3 border-t pt-6"><Button type="button" variant="outline" disabled={step === 0 || busy || uncertain} onClick={() => { setStep(step - 1); setErrors({}); setError(null); }}><ArrowLeft />Back</Button><Button type="submit" className="min-h-11" disabled={busy || uncertain || delay > 0}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}{busy ? "Creating shipment…" : step === 3 ? "Create shipment" : "Continue"}</Button></div>
        </CardContent>
      </Card>
      <Card className="self-start"><CardHeader><MapPin className="size-6 text-primary" aria-hidden="true" /><CardTitle>Before you book</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p>Your final price and currency will appear after the shipment is created.</p><p>Review contact details carefully. Booked addresses and parcel details cannot be edited.</p><p>Secure online payment will be available in the next release.</p></CardContent></Card>
    </form>
  </div>;
}
function ReviewAddress({ title, name, phone, address }: { title: string; name: string; phone: string; address: string }) {
  return <section className="space-y-1 break-words"><h3>{title}</h3><p>{name} · {phone}</p><p>{address}</p></section>;
}
