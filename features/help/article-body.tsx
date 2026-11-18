import type { HelpSection } from "@/services/ai/help-content";

// Help articles use paragraphs and "- " lists only, rendered as React text (no raw HTML).
function Blocks({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim());
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}
            </ul>
          );
        }
        return <p key={index}>{lines.join(" ")}</p>;
      })}
    </>
  );
}

export function ArticleBody({ sections }: { sections: HelpSection[] }) {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
      {sections.map((section) => (
        <section key={section.anchor || "intro"} id={section.anchor || undefined} aria-labelledby={section.anchor ? `${section.anchor}-heading` : undefined} className="scroll-mt-24 space-y-2">
          {section.anchor && <h2 id={`${section.anchor}-heading`} className="text-base font-semibold text-ink">{section.heading}</h2>}
          <Blocks body={section.body} />
        </section>
      ))}
    </div>
  );
}
