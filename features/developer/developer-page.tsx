"use client";

import { BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysPanel } from "./api-keys-panel";
import { WebhooksPanel } from "./webhooks-panel";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("developer");
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("integrations")}</p>
          <h1>{t("developerSettings")}</h1>
          <p>{t("connectYourOwnSystems")}</p>
        </div>
      </div>

      <ApiKeysPanel />
      <WebhooksPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4 text-primary" aria-hidden="true" /> {t("quickGuide")}</CardTitle>
          <CardDescription>{t("whatAKeyCan")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>{t.rich("guideRead", { code: (chunks) => <code>{chunks}</code> })}</li>
            <li>{t.rich("guideWrite", { code: (chunks) => <code>{chunks}</code> })}</li>
            <li>{t.rich("guideManage", { code: (chunks) => <code>{chunks}</code> })}</li>
            <li>{t("eachKeyIsLimited")}</li>
          </ul>
          <div className="space-y-1.5">
            <h3 className="font-semibold">{t("callingTheApi")}</h3>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{REQUEST_EXAMPLE}</code></pre>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">{t("verifyingAWebhookNode")}</h3>
            <p className="text-muted-foreground">
              {t.rich("guideVerify", {
                signature: () => <code>ExpressHub-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>,
                body: () => <code> &lt;t&gt;.&lt;raw body&gt;</code>,
                event: () => <code>ExpressHub-Event-Id</code>,
              })}
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{VERIFY_EXAMPLE}</code></pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
