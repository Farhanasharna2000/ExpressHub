"use client";

import { BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysPanel } from "./api-keys-panel";
import { WebhooksPanel } from "./webhooks-panel";

const REQUEST_EXAMPLE = `curl https://<your-expresshub-domain>/api/v1/shipments \\
  -H "Authorization: Bearer $EXPRESSHUB_API_KEY"`;

export const VERIFY_EXAMPLE = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes received, before JSON.parse.
export function verifyExpressHubWebhook(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(\`\${timestamp}.\${rawBody}\`).digest();
  const received = Buffer.from(parts.v1 ?? "", "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}`;

export function DeveloperPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1>Developer settings</h1>
          <p>Connect your own systems to ExpressHub with API keys and webhooks.</p>
        </div>
      </div>

      <ApiKeysPanel />
      <WebhooksPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4 text-primary" aria-hidden="true" /> Quick guide</CardTitle>
          <CardDescription>What a key can do, and how to check that a webhook really came from ExpressHub.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li><code>shipments:read</code>: list and view your shipments.</li>
            <li><code>shipments:write</code>: book shipments and cancel ones that have not been picked up.</li>
            <li><code>webhooks:manage</code>: add, change and test webhook endpoints. Keys can never create or revoke other keys.</li>
            <li>Each key is limited to 120 requests a minute.</li>
          </ul>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Calling the API</h3>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{REQUEST_EXAMPLE}</code></pre>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Verifying a webhook (Node.js)</h3>
            <p className="text-muted-foreground">
              Each request has <code>ExpressHub-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, an HMAC-SHA256 of
              <code> &lt;t&gt;.&lt;raw body&gt;</code> with your signing secret. Use <code>ExpressHub-Event-Id</code> to ignore duplicates,
              and reply with any 2xx status within 5 seconds.
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{VERIFY_EXAMPLE}</code></pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
