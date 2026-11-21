"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Bot, MessageCircle, Package, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/features/auth/provider";
import { useResource } from "@/features/shipments/use-resource";
import { aiErrorMessage } from "./ai-error";
import {
  MAX_ASSISTANT_INPUT,
  assistantSuggestions,
  followUpSuggestions,
  greeting,
  requestHistory,
  shipmentHref,
  waitingMessage,
  type AssistantReply,
  type ChatMessage,
} from "./contracts";


import { useTranslations } from "next-intl";
export function AssistantLauncher() {
  const { user } = useSession();
  const { data } = useResource<{ assistant: boolean }>("/ai/status");
  if (!user || !data?.assistant) return null;
  // Remount per account so a conversation never carries over to another user.
  return <AssistantPanel key={user.id} role={user.role} name={user.name} />;
}

function SuggestionChips({ items, onPick, disabled }: { items: string[]; onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => onPick(item)}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function TypingIndicator({ seconds }: { seconds: number }) {
  const t = useTranslations("ai");
  const waiting: Record<string, string> = { "Checking your shipments…": t("waiting.checking"), "Reading the tracking details…": t("waiting.reading"), "Almost done…": t("waiting.almost") };
  return (
    <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      <span>{waiting[waitingMessage(seconds)] ?? waitingMessage(seconds)}</span>
    </div>
  );
}

function AssistantPanel({ role, name }: { role: string; name?: string }) {
  const t = useTranslations("ai");
  const courier = role === "COURIER";
  const first = name?.trim().split(/\s+/)[0];
  const hello = t(courier ? "greetingCourier" : "greetingCustomer", { name: first ? ` ${first}` : "" });
  const starters = courier ? [t("suggest.courier1"), t("suggest.courier2"), t("suggest.courier3")] : [t("suggest.customer1"), t("suggest.customer2"), t("suggest.customer3")];
  const followUps = courier ? [t("suggest.courierFollow1"), t("suggest.courierFollow2")] : [t("suggest.customerFollow1"), t("suggest.customerFollow2")];
  const { store } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<{ text: string; retry: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, error]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearInterval(timer);
      setWaited(0);
    };
  }, [busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const result = await store.api.request<AssistantReply>("/ai/assistant", {
        method: "POST",
        body: { messages: requestHistory(next) },
      });
      setMessages([...next, { role: "assistant", content: result.reply, shipments: result.shipments }]);
    } catch (cause) {
      setMessages(messages);
      setError({ text: aiErrorMessage(cause), retry: content });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function startOver() {
    setMessages([]);
    setError(null);
    setDraft("");
    inputRef.current?.focus();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter that confirms an IME word (Avro, mobile Bangla keyboards) must not send.
    // Safari reports that keystroke with keyCode 229 rather than isComposing.
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      void send(draft);
    }
  }

  const last = messages.at(-1);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-12 rounded-full px-5 shadow-lg"
        aria-haspopup="dialog"
      >
        <MessageCircle className="size-5" aria-hidden="true" />
        {t("askAssistant")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex h-[min(640px,88vh)] flex-col gap-3 p-4 sm:max-w-lg sm:p-5"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogHeader className="pr-8">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-4 text-primary" aria-hidden="true" />
                </span>
                {t("shipmentAssistant")}
              </DialogTitle>
              {messages.length > 0 && (
                <Button type="button" variant="ghost" size="xs" onClick={startOver} disabled={busy}>
                  <RotateCcw aria-hidden="true" /> {t("newChat")}
                </Button>
              )}
            </div>
            <DialogDescription className="text-left text-xs">
              {t("answersComeFromYour")}
            </DialogDescription>
          </DialogHeader>

          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1" aria-live="polite">
            <p className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
              <span className="sr-only">{t("assistant")} </span>
              {hello}
            </p>
            {messages.length === 0 && (
              <SuggestionChips items={starters} onPick={(text) => void send(text)} disabled={busy} />
            )}

            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "max-w-[85%] self-end" : "max-w-[90%] self-start"}>
                <p
                  className={
                    message.role === "user"
                      ? "rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
                      : "rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                  }
                >
                  <span className="sr-only">{message.role === "user" ? t("you") : t("assistant2")}</span>
                  {message.content}
                </p>
                {message.role === "assistant" && Boolean(message.shipments?.length) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {message.shipments?.map((shipment) => (
                      <Link
                        key={shipment.id}
                        href={shipmentHref(role, shipment.id)}
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Package className="size-3" aria-hidden="true" /> {t("viewTracking", { tracking: shipment.trackingNumber })}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {busy && <TypingIndicator seconds={waited} />}

            {!busy && last?.role === "assistant" && (
              <SuggestionChips items={followUps} onPick={(text) => void send(text)} disabled={busy} />
            )}

            {error && (
              <div role="alert" className="flex flex-col gap-2 self-start rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <span>{error.text}</span>
                <Button type="button" variant="outline" size="xs" className="self-start" onClick={() => void send(error.retry)}>
                  <RotateCcw aria-hidden="true" /> {t("tryAgain")}
                </Button>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">{t("messageTheAssistant")}</label>
              <textarea
                ref={inputRef}
                id="assistant-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                maxLength={MAX_ASSISTANT_INPUT}
                rows={1}
                placeholder={t("askAboutAShipment")}
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <Button type="submit" size="icon-lg" className="rounded-xl" disabled={busy || !draft.trim()} aria-label={t("sendMessage")}>
                <Send aria-hidden="true" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("enterToSendShift")}</p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
