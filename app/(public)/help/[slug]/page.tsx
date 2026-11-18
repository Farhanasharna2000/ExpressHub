import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArticleBody } from "@/features/help/article-body";
import { readHelpArticles } from "@/lib/help-articles";

export const dynamic = "force-static";
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return readHelpArticles().map((article) => ({ slug: article.slug }));
}

function findArticle(slug: string) {
  return readHelpArticles().find((article) => article.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = findArticle((await params).slug);
  return { title: article ? `${article.title} · Help` : "Help centre" };
}

export default async function HelpArticlePage({ params }: Props) {
  const article = findArticle((await params).slug);
  if (!article) notFound();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow"><Link href="/help" className="hover:underline">Help centre</Link></p>
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
