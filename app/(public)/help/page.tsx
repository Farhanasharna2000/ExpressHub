import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StaggerIn } from "@/components/stagger-in";
import { readHelpArticles } from "@/lib/help-articles";
import { getLocale, getTranslations } from "next-intl/server";

// Rendered per request: the page follows the language cookie. Articles are read from disk.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("helpPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function HelpCentrePage() {
  const t = await getTranslations("helpPage");
  const locale = await getLocale();
  const articles = readHelpArticles();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
          {locale !== "en" && <p className="text-xs">{t("englishNote")}</p>}
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
