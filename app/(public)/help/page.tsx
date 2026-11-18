import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StaggerIn } from "@/components/stagger-in";
import { readHelpArticles } from "@/lib/help-articles";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about booking, pricing, payments, tracking, cancellations and refunds at ExpressHub.",
};

export default function HelpCentrePage() {
  const articles = readHelpArticles();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Help centre</p>
          <h1>How can we help?</h1>
          <p>Guides to booking, paying, tracking and managing your shipments. You can also ask the help chat.</p>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <StaggerIn selector=":scope > ul > li">
          <ul className="grid gap-3 sm:grid-cols-2">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/help/${article.slug}`}
                  className="block rounded-lg border p-4 hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="font-medium text-ink">{article.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{article.sections.find((section) => section.anchor === "")?.body.split("\n")[0] ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
          </StaggerIn>
        </CardContent>
      </Card>
    </div>
  );
}
