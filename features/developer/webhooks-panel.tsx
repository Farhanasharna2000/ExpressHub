"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { dateTime } from "@/features/shipments/contracts";
import { useResource } from "@/features/shipments/use-resource";
import { errorMessage } from "@/lib/client/api";
import {
  EVENT_LABELS, MAX_WEBHOOK_ENDPOINTS, WEBHOOK_EVENTS, type WebhookDeliverySummary, type WebhookEndpointSummary,
} from "./contracts";
import { OneTimeSecret } from "./one-time-secret";

export function WebhooksPanel() {
  const { store } = useSession();
  const { data, loading, error, reload } = useResource<{ endpoints: WebhookEndpointSummary[]; available: boolean }>("/developer/webhooks");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function run<T>(action: () => Promise<T>, failure: string) {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    try {
      return await action();
    } catch (cause) {
      toast.error(failure, errorMessage(cause));
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await run(
      () => store.api.request<{ secret: string }>("/developer/webhooks", { method: "POST", body: { url, description: description || undefined, events } }),
      "Could not add endpoint",
    );
    if (result) {
      setSecret(result.secret);
      setUrl("");
      setDescription("");
    }
  }

  const toggleEvent = (name: string) =>
    setEvents((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));

  const unavailable = data && !data.available;
  const full = (data?.endpoints.length ?? 0) >= MAX_WEBHOOK_ENDPOINTS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Webhook className="size-4 text-primary" aria-hidden="true" /> Webhooks</CardTitle>
        <CardDescription>
          ExpressHub sends a signed POST to your endpoint when your shipments change. Failed deliveries are retried for about a day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {secret && <OneTimeSecret label="Signing secret" value={secret} onDone={() => setSecret(null)} />}
        {unavailable && (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Webhooks are not switched on for this server yet. API keys still work.
          </p>
        )}

        <form onSubmit={create} className="space-y-4 rounded-lg border p-4" aria-label="Add a webhook endpoint">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input id="webhook-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} required
              placeholder="https://your-shop.example/expresshub/webhooks" />
            <p className="text-xs text-muted-foreground">Must use https and a public address.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-description">Description (optional)</Label>
            <Input id="webhook-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Events</legend>
            {WEBHOOK_EVENTS.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} className="size-4" />
                {EVENT_LABELS[name]} <code className="text-xs text-muted-foreground">{name}</code>
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || unavailable || full || !url.trim() || events.length === 0}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Add endpoint
          </Button>
        </form>

        {error ? (
          <ErrorNotice title="Could not load webhooks" action={<Button variant="outline" size="sm" onClick={reload}>Try again</Button>}>
            {errorMessage(error)}
          </ErrorNotice>
        ) : loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading endpoints…</p>
        ) : data?.endpoints.length ? (
          <ul className="space-y-3" aria-label="Your webhook endpoints">
            {data.endpoints.map((endpoint) => (
              <EndpointItem key={endpoint.id} endpoint={endpoint} run={run} onSecret={setSecret} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No endpoints yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

type Run = <T>(action: () => Promise<T>, failure: string) => Promise<T | null>;

function EndpointItem({ endpoint, run, onSecret }: { endpoint: WebhookEndpointSummary; run: Run; onSecret: (secret: string) => void }) {
  const { store } = useSession();
  const [showLog, setShowLog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const path = `/developer/webhooks/${encodeURIComponent(endpoint.id)}`;

  return (
    <li className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs break-all">{endpoint.url}</p>
          {endpoint.description && <p className="text-muted-foreground">{endpoint.description}</p>}
          <p className="text-xs text-muted-foreground">
            {endpoint.events.map((name) => EVENT_LABELS[name] ?? name).join(", ")} · {endpoint.active ? "Active" : "Disabled"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            await store.api.request(`${path}/test`, { method: "POST" });
            toast.success("Test event queued", "Check the delivery log in a moment.");
            setShowLog(true);
          }, "Could not send test event")}>Send test</Button>
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            await store.api.request(path, { method: "PATCH", body: { active: !endpoint.active } });
          }, "Could not update endpoint")}>{endpoint.active ? "Disable" : "Enable"}</Button>
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            const result = await store.api.request<{ secret: string }>(`${path}/rotate-secret`, { method: "POST" });
            onSecret(result.secret);
          }, "Could not rotate secret")}>Rotate secret</Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" onClick={() => void run(async () => {
                await store.api.request(path, { method: "DELETE" });
                toast.success("Endpoint deleted", "No more webhooks will be sent to it.");
              }, "Could not delete endpoint")}>Confirm delete</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${endpoint.url}`}>Delete</Button>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" aria-expanded={showLog} onClick={() => setShowLog((value) => !value)}>
        {showLog ? "Hide delivery log" : "Show delivery log"}
      </Button>
      {showLog && <DeliveryLog path={path} run={run} />}
    </li>
  );
}

function DeliveryLog({ path, run }: { path: string; run: Run }) {
  const { store } = useSession();
  const { data, error, reload } = useResource<{ deliveries: WebhookDeliverySummary[] }>(`${path}/deliveries?limit=10`);
  if (error) {
    return <ErrorNotice title="Could not load deliveries" action={<Button variant="outline" size="sm" onClick={reload}>Try again</Button>}>{errorMessage(error)}</ErrorNotice>;
  }
  if (!data) return <p className="text-xs text-muted-foreground">Loading deliveries…</p>;
  if (!data.deliveries.length) return <p className="text-xs text-muted-foreground">No deliveries yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Recent deliveries</caption>
        <thead className="text-muted-foreground">
          <tr><th className="py-1 pr-3 font-medium">Event</th><th className="py-1 pr-3 font-medium">Status</th><th className="py-1 pr-3 font-medium">Attempts</th><th className="py-1 pr-3 font-medium">Response</th><th className="py-1 pr-3 font-medium">Created</th><th className="py-1"><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody className="divide-y">
          {data.deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td className="py-1.5 pr-3 font-mono">{delivery.eventType}</td>
              <td className="py-1.5 pr-3">{delivery.status === "FAILED" ? `Retrying ${dateTime(delivery.nextAttemptAt)}` : delivery.status.toLowerCase()}</td>
              <td className="py-1.5 pr-3">{delivery.attempts}</td>
              <td className="py-1.5 pr-3">{delivery.lastStatusCode ?? delivery.lastError ?? "—"}</td>
              <td className="py-1.5 pr-3">{dateTime(delivery.createdAt)}</td>
              <td className="py-1.5">
                {delivery.status === "DEAD" && (
                  <Button size="sm" variant="outline" onClick={() => void run(async () => {
                    await store.api.request(`${path}/deliveries/${encodeURIComponent(delivery.id)}/retry`, { method: "POST" });
                    toast.success("Delivery queued", "It will be sent again in a moment.");
                  }, "Could not retry delivery")}>Retry</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
