"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, HelpCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RevealIn } from "@/components/stagger-in";
import { useSession } from "@/features/auth/provider";
import { isCancelled } from "@/lib/client/api";
import { aiErrorMessage } from "./ai-error";

import { useTranslations } from "next-intl";
export const HELP_INPUT_MAX = 500;

type HelpSource = { title: string; section: string; href: string };
type HelpAnswer = { answer: string; sources: HelpSource[]; fallback: boolean };
type Exchange = { id: number; question: string; reply?: HelpAnswer; error?: string };

export default function HelpWidget() {
  const { store, status } = useSession();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    let timer: number | undefined;
    // Settling an anonymous session can cancel this request without changing the
    // status, so a cancelled check is retried a few times instead of hiding help.
    const check = (attempt: number) => {
      store.api
        .request<{ available: boolean }>("/ai/help")
        .then((result) => { if (active) setShown(result.available === true); })
        .catch((cause) => {
          if (!active) return;
          if (isCancelled(cause) && attempt < 3) timer = window.setTimeout(() => check(attempt + 1), 300);
          else setShown(false);
        });
    };
    check(0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [store, status]);

  if (!shown) return null;
  return <HelpPanel />;
}

function HelpPanel() {
  const t = useTranslations("ai");
  const SUGGESTIONS = [t("howIsThePrice"), t("canICancelMy"), t("howDoRefundsWork")];
  const { store } = useSession();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [exchanges]);

  async function ask(text: string) {
    const question = text.trim();
    if (busy || question.length < 3) return;
    const id = nextId.current++;
    setBusy(true);
    setInput("");
    setExchanges((items) => [...items, { id, question }]);
    try {
      const result = await store.api.request<{ help: HelpAnswer }>("/ai/help", { method: "POST", body: { question } });
      setExchanges((items) => items.map((item) => (item.id === id ? { ...item, reply: result.help } : item)));
    } catch (cause) {
      const error = aiErrorMessage(cause);
      setExchanges((items) => items.map((item) => (item.id === id ? { ...item, error } : item)));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void ask(input);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A real trigger, so closing the dialog returns focus to this button. */}
        <DialogTrigger asChild>
          <Button type="button" className="fixed right-4 bottom-4 z-40 h-12 rounded-full px-5 shadow-lg">
            <HelpCircle aria-hidden="true" /> {t("help")}
          </Button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" aria-hidden="true" /> {t("help")}
            </DialogTitle>
            <DialogDescription>
              {t("answersComeFromThe")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm" aria-live="polite" aria-busy={busy}>
            {exchanges.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">{t("tryOneOfThese")}</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void ask(suggestion)}
                      disabled={busy}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {exchanges.map((item, index) => (
              <div key={item.id} className="space-y-2">
                <p className="ml-8 rounded-lg bg-primary/10 px-3 py-2"><span className="sr-only">{t("youAsked")} </span>{item.question}</p>
                {!item.reply && !item.error && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("checkingArticles")}
                  </p>
                )}
                {item.error && <p role="alert" className="text-destructive">{item.error}</p>}
                {item.reply && (
                  // Only the newest answer animates, so reopening the panel doesn't replay old ones.
                  <RevealIn animate={index === exchanges.length - 1} className="mr-8 space-y-2 rounded-lg border bg-background px-3 py-2">
                    <p>{item.reply.answer}</p>
                    {item.reply.fallback ? (
                      <Link href="/help" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">
                        {t("browseHelp")}
                      </Link>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{t("sources")}</p>
                        <ul className="mt-1 space-y-1 text-xs">
                          {item.reply.sources.map((source) => (
                            <li key={source.href}>
                              <Link href={source.href} onClick={() => setOpen(false)} className="text-primary hover:underline">
                                {source.title}{source.section !== source.title ? ` · ${source.section}` : ""}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </RevealIn>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <label htmlFor="help-question" className="sr-only">{t("yourQuestion")}</label>
            <textarea
              id="help-question"
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, HELP_INPUT_MAX))}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={HELP_INPUT_MAX}
              placeholder={t("askAboutBookingPrices")}
              className="min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <Button type="submit" disabled={busy || input.trim().length < 3} aria-label={t("sendQuestion")}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </Button>
          </form>
          <p className="text-right text-[11px] text-muted-foreground" aria-hidden="true">{input.length}/{HELP_INPUT_MAX}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
