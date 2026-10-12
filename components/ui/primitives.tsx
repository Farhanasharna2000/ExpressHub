import { PackageOpen, Loader2 } from "lucide-react";
import { Button as ShadcnButton } from "./button";
import { Input as ShadcnInput } from "./input";
import { Label } from "./label";
import { Card as ShadcnCard } from "./card";
import { NativeSelect } from "./native-select";
import { Badge } from "./badge";
import { Alert, AlertTitle, AlertDescription } from "./alert";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import type { ShipmentStatus, PaymentStatus } from "@/types/api";

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return <ShadcnButton type={type} variant={variant === "danger" ? "destructive" : variant === "secondary" ? "outline" : "default"} className={`min-h-11 ${className}`} {...props} />;
}
export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <ShadcnButton asChild variant={secondary ? "outline" : "default"} className="min-h-11"><Link href={href}>{children}</Link></ShadcnButton>;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ShadcnCard className={`card block ${className}`}>{children}</ShadcnCard>;
}
type Field = { id: string; label: string; hint?: string; error?: string };
function descriptionIds(id: string, hint?: string, error?: string, extra?: string) {
  return [extra, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}
export function Input({ id, label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & Field) {
  return <div className="field"><Label htmlFor={id}>{label}</Label><ShadcnInput {...props} id={id} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptionIds(id, hint, error, props["aria-describedby"])} />{hint && <small id={`${id}-hint`}>{hint}</small>}{error && <small className="field-error" id={`${id}-error`} role="alert">{error}</small>}</div>;
}
export function Select({ id, label, hint, error, children, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & Field) {
  return <div className="field"><Label htmlFor={id}>{label}</Label><NativeSelect {...props} id={id} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptionIds(id, hint, error, props["aria-describedby"])}>{children}</NativeSelect>{hint && <small id={`${id}-hint`}>{hint}</small>}{error && <small className="field-error" id={`${id}-error`} role="alert">{error}</small>}</div>;
}
const labels: Record<ShipmentStatus | PaymentStatus, string> = { CREATED: "Created", PICKED_UP: "Picked up", IN_TRANSIT: "In transit", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", FAILED: "Failed", RETURNED: "Returned", CANCELLED: "Cancelled", PENDING: "Pending", PAID: "Paid", REFUND_PENDING: "Refund pending", REFUNDED: "Refunded" };
export function StatusBadge({ status }: { status: ShipmentStatus | PaymentStatus }) {
  const tone = ["PAID", "DELIVERED"].includes(status) ? "success" : status === "FAILED" ? "danger" : ["PENDING", "REFUND_PENDING", "CREATED"].includes(status) ? "warning" : "neutral";
  return <Badge variant="outline" className={`badge badge-${tone}`}>{labels[status]}</Badge>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><PackageOpen className="empty-symbol mx-auto size-8" aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{action}</div>;
}
export function ErrorNotice({ title = "Something went wrong", children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{children}{action}</AlertDescription></Alert>;
}
export function LoadingState({ label = "Loading your workspace…" }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><Loader2 className="size-5 animate-spin" aria-hidden="true" /><p>{label}</p></div>;
}
export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode };
export function ResponsiveTable<T>({ caption, columns, rows, rowKey, empty }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return <><div className="table-desktop"><table><caption>{caption}</caption><thead><tr>{columns.map(c => <th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(c => <td key={c.key}>{c.render(row)}</td>)}</tr>)}</tbody></table></div><div className="table-mobile" aria-label={caption}>{rows.map(row => <Card key={rowKey(row)}><dl>{columns.map(c => <div key={c.key}><dt>{c.label}</dt><dd>{c.render(row)}</dd></div>)}</dl></Card>)}</div></>;
}
