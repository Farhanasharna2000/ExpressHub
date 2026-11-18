"use client";

import { useRef, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
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
import { API_KEY_SCOPES, MAX_ACTIVE_API_KEYS, SCOPE_LABELS, apiKeyState, maskedKey, type ApiKeySummary } from "./contracts";
import { OneTimeSecret } from "./one-time-secret";

export function ApiKeysPanel() {
  const { store } = useSession();
  const { data, loading, error, reload } = useResource<{ apiKeys: ApiKeySummary[] }>("/developer/api-keys");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["shipments:read"]);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const pending = useRef(false);
  const activeCount = data?.apiKeys.filter((key) => apiKeyState(key) === "Active").length ?? 0;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await store.api.request<{ key: string }>("/developer/api-keys", {
        method: "POST",
        body: { name, scopes, expiresInDays: expiresInDays ? Number(expiresInDays) : null },
      });
      setCreated(result.key);
      setName("");
    } catch (cause) {
      toast.error("Could not create API key", errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (pending.current) return;
    pending.current = true;
    try {
      await store.api.request(`/developer/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("API key revoked", "Requests using it are rejected from now on.");
      setConfirming(null);
    } catch (cause) {
      toast.error("Could not revoke API key", errorMessage(cause));
    } finally {
      pending.current = false;
    }
  }

  const toggleScope = (scope: string) =>
    setScopes((current) => (current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-primary" aria-hidden="true" /> API keys</CardTitle>
        <CardDescription>
          Use a key from your own server to book and track shipments. Send it as <code>Authorization: Bearer &lt;key&gt;</code>.
          Never put a key in a browser or mobile app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {created && <OneTimeSecret label="API key" value={created} onDone={() => setCreated(null)} />}

        <form onSubmit={create} className="space-y-4 rounded-lg border p-4" aria-label="Create an API key">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-name">Key name</Label>
              <Input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="e.g. Shop backend" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-key-expiry">Expires</Label>
              <select id="api-key-expiry" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Never</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="365">In 1 year</option>
              </select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Permissions</legend>
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} className="size-4" />
                {SCOPE_LABELS[scope]} <code className="text-xs text-muted-foreground">{scope}</code>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !name.trim() || scopes.length === 0 || activeCount >= MAX_ACTIVE_API_KEYS}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Create key
            </Button>
            <span className="text-xs text-muted-foreground">{activeCount} of {MAX_ACTIVE_API_KEYS} active keys used</span>
          </div>
        </form>

        {error ? (
          <ErrorNotice title="Could not load API keys" action={<Button variant="outline" size="sm" onClick={reload}>Try again</Button>}>
            {errorMessage(error)}
          </ErrorNotice>
        ) : loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading keys…</p>
        ) : data?.apiKeys.length ? (
          <ul className="divide-y rounded-lg border" aria-label="Your API keys">
            {data.apiKeys.map((key) => {
              const state = apiKeyState(key);
              return (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{key.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${state === "Active" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{state}</span></p>
                    <p className="font-mono text-xs text-muted-foreground">{maskedKey(key.prefix)}</p>
                    <p className="text-xs text-muted-foreground">
                      {key.scopes.join(", ")} · Created {dateTime(key.createdAt)} · {key.lastUsedAt ? `Last used ${dateTime(key.lastUsedAt)}` : "Never used"}
                      {key.expiresAt ? ` · Expires ${dateTime(key.expiresAt)}` : ""}
                    </p>
                  </div>
                  {state === "Active" && (confirming === key.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => void revoke(key.id)}>Confirm revoke</Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>Keep</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConfirming(key.id)} aria-label={`Revoke ${key.name}`}>Revoke</Button>
                  ))}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
