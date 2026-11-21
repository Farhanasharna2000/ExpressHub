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
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
import { useResource } from "@/features/shipments/use-resource";
import { errorMessage } from "@/lib/client/api";
import {
  MAX_WEBHOOK_ENDPOINTS, WEBHOOK_EVENTS, type WebhookDeliverySummary, type WebhookEndpointSummary,
} from "./contracts";
import { OneTimeSecret } from "./one-time-secret";

import { useTranslations } from "next-intl";
export function WebhooksPanel() {
  const t = useTranslations("developer");
  const k = (prefix: string, value: string) => t(`${prefix}.${value.replace(/[:.]/g, "_")}` as Parameters<typeof t>[0]);
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
      t("couldNotAddEndpoint"),
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
        <CardTitle className="flex items-center gap-2 text-base"><Webhook className="size-4 text-primary" aria-hidden="true" /> {t("webhooks")}</CardTitle>
        <CardDescription>
          {t("expresshubSendsASigned")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {secret && <OneTimeSecret label={t("signingSecret")} value={secret} onDone={() => setSecret(null)} />}
        {unavailable && (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("webhooksAreNotSwitched")}
          </p>
        )}

        <form onSubmit={create} className="space-y-4 rounded-lg border p-4" aria-label={t("addAWebhookEndpoint")}>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">{t("endpointUrl")}</Label>
            <Input id="webhook-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} required
              placeholder="https://your-shop.example/expresshub/webhooks" />
            <p className="text-xs text-muted-foreground">{t("mustUseHttpsAnd")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-description">{t("descriptionOptional")}</Label>
            <Input id="webhook-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("events")}</legend>
            {WEBHOOK_EVENTS.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} className="size-4" />
                {k("eventNames", name)} <code className="text-xs text-muted-foreground">{name}</code>
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || unavailable || full || !url.trim() || events.length === 0}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} {t("addEndpoint")}
          </Button>
        </form>

        {error ? (
          <ErrorNotice title={t("couldNotLoadWebhooks")} action={<Button variant="outline" size="sm" onClick={reload}>{t("tryAgain")}</Button>}>
            {errorMessage(error)}
          </ErrorNotice>
        ) : loading && !data ? (
          <p className="text-sm text-muted-foreground">{t("loadingEndpoints")}</p>
        ) : data?.endpoints.length ? (
          <ul className="space-y-3" aria-label={t("yourWebhookEndpoints")}>
            {data.endpoints.map((endpoint) => (
              <EndpointItem key={endpoint.id} endpoint={endpoint} run={run} onSecret={setSecret} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noEndpointsYet")}</p>
        )}
      </CardContent>
    </Card>
  );
}

type Run = <T>(action: () => Promise<T>, failure: string) => Promise<T | null>;

function EndpointItem({ endpoint, run, onSecret }: { endpoint: WebhookEndpointSummary; run: Run; onSecret: (secret: string) => void }) {
  const t = useTranslations("developer");
  const k = (prefix: string, value: string) => t(`${prefix}.${value.replace(/[:.]/g, "_")}` as Parameters<typeof t>[0]);
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
            {endpoint.events.map((name) => k("eventNames", name)).join(", ")} · {endpoint.active ? t("active") : t("disabled")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            await store.api.request(`${path}/test`, { method: "POST" });
            toast.success(t("testEventQueued"), t("checkTheDeliveryLog"));
            setShowLog(true);
          }, t("couldNotSendTest"))}>{t("sendTest")}</Button>
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            await store.api.request(path, { method: "PATCH", body: { active: !endpoint.active } });
          }, t("couldNotUpdateEndpoint"))}>{endpoint.active ? t("disable") : t("enable")}</Button>
          <Button size="sm" variant="outline" onClick={() => void run(async () => {
            const result = await store.api.request<{ secret: string }>(`${path}/rotate-secret`, { method: "POST" });
            onSecret(result.secret);
          }, t("couldNotRotateSecret"))}>{t("rotateSecret")}</Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" onClick={() => void run(async () => {
                await store.api.request(path, { method: "DELETE" });
                toast.success(t("endpointDeleted"), t("noMoreWebhooksWill"));
              }, t("couldNotDeleteEndpoint"))}>{t("confirmDelete")}</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>{t("keep")}</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)} aria-label={t("deleteNamed", { url: endpoint.url })}>{t("delete")}</Button>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" aria-expanded={showLog} onClick={() => setShowLog((value) => !value)}>
        {showLog ? t("hideDeliveryLog") : t("showDeliveryLog")}
      </Button>
      {showLog && <DeliveryLog path={path} run={run} />}
    </li>
  );
}

function DeliveryLog({ path, run }: { path: string; run: Run }) {
  const t = useTranslations("developer");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  const { store } = useSession();
  const { data, error, reload } = useResource<{ deliveries: WebhookDeliverySummary[] }>(`${path}/deliveries?limit=10`);
  if (error) {
    return <ErrorNotice title={t("couldNotLoadDeliveries")} action={<Button variant="outline" size="sm" onClick={reload}>{t("tryAgain")}</Button>}>{errorMessage(error)}</ErrorNotice>;
  }
  if (!data) return <p className="text-xs text-muted-foreground">{t("loadingDeliveries")}</p>;
  if (!data.deliveries.length) return <p className="text-xs text-muted-foreground">{t("noDeliveriesYet")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{t("recentDeliveries")}</caption>
        <thead className="text-muted-foreground">
          <tr><th className="py-1 pr-3 font-medium">{t("event")}</th><th className="py-1 pr-3 font-medium">{t("status")}</th><th className="py-1 pr-3 font-medium">{t("attempts")}</th><th className="py-1 pr-3 font-medium">{t("response")}</th><th className="py-1 pr-3 font-medium">{t("created")}</th><th className="py-1"><span className="sr-only">{t("actions")}</span></th></tr>
        </thead>
        <tbody className="divide-y">
          {data.deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td className="py-1.5 pr-3 font-mono">{delivery.eventType}</td>
              <td className="py-1.5 pr-3">{delivery.status === "FAILED" ? t("retrying", { time: f.dateTime(delivery.nextAttemptAt) }) : statusLabel(delivery.status).toLowerCase()}</td>
              <td className="py-1.5 pr-3">{f.number(delivery.attempts)}</td>
              <td className="py-1.5 pr-3">{delivery.lastStatusCode ?? delivery.lastError ?? "—"}</td>
              <td className="py-1.5 pr-3">{f.dateTime(delivery.createdAt)}</td>
              <td className="py-1.5">
                {delivery.status === "DEAD" && (
                  <Button size="sm" variant="outline" onClick={() => void run(async () => {
                    await store.api.request(`/developer/webhook-deliveries/${encodeURIComponent(delivery.id)}/retry`, { method: "POST" });
                    toast.success(t("deliveryQueued"), t("itWillBeSent"));
                  }, t("couldNotRetryDelivery"))}>{t("retry")}</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
