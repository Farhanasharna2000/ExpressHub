import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArticleBody } from "@/features/help/article-body";
import { readHelpArticles } from "@/lib/help-articles";

type Props = { params: Promise<{ slug: string }> };

function findArticle(slug: string) {
  return readHelpArticles().find((article) => article.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = findArticle((await params).slug);
  const t = await getTranslations("helpPage");
  return { title: article ? t("articleMetaTitle", { title: article.title }) : t("metaTitle") };
}

export default async function HelpArticlePage({ params }: Props) {
  const article = findArticle((await params).slug);
  if (!article) notFound();
  const t = await getTranslations("helpPage");
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow"><Link href="/help" className="hover:underline">{t("eyebrow")}</Link></p>
          <h1>{article.title}</h1>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ArticleBody sections={article.sections} />
        </CardContent>
      </Card>
    </div>
  );
}
