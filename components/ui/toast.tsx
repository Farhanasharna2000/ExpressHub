"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Toast, Portal } from "radix-ui";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  id?: string;
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
  tone?: ToastTone;
  duration?: number;
  dataAttribute?: Record<string, string>;
}

export interface ToastItem {
  id: string;
  title?: string;
  message: ReactNode;
  action?: ReactNode;
  tone: ToastTone;
  duration: number;
  dataAttribute?: Record<string, string>;
}

type ToastListener = (items: ToastItem[]) => void;

let memoryToasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  const current = [...memoryToasts];
  listeners.forEach((listener) => listener(current));
}

function parseToastArgs(
  defaultTone: ToastTone,
  titleOrMessage: string,
  messageOrOptions?: ReactNode | Omit<ToastOptions, "tone">,
  options?: Omit<ToastOptions, "tone">
): ToastItem {
  let title: string | undefined;
  let message: ReactNode = "";
  let action: ReactNode | undefined;
  let finalOpts: Omit<ToastOptions, "tone"> = {};

  if (
    typeof messageOrOptions === "string" ||
    (messageOrOptions && typeof messageOrOptions === "object" && "type" in (messageOrOptions as Record<string, unknown>))
  ) {
    title = titleOrMessage;
    message = messageOrOptions as ReactNode;
    if (options) finalOpts = options;
  } else if (messageOrOptions && typeof messageOrOptions === "object") {
    message = titleOrMessage;
    finalOpts = messageOrOptions as Omit<ToastOptions, "tone">;
    if (finalOpts.title) title = finalOpts.title;
    if (finalOpts.action) action = finalOpts.action;
  } else {
    message = titleOrMessage;
  }

  if (finalOpts.action) action = finalOpts.action;
  const id = finalOpts.id || Math.random().toString(36).slice(2, 9);
  const duration = finalOpts.duration ?? (defaultTone === "error" ? 7000 : 5000);

  return {
    id,
    title,
    message,
    action,
    tone: defaultTone,
    duration,
    dataAttribute: finalOpts.dataAttribute,
  };
}

export const toast = Object.assign(
  function toastFn(options: ToastOptions | string): string {
    if (typeof options === "string") {
      return toast.info(options);
    }
    const item: ToastItem = {
      id: options.id || Math.random().toString(36).slice(2, 9),
      title: options.title,
      message: options.message ?? "",
      action: options.action,
      tone: options.tone ?? "info",
      duration: options.duration ?? 5000,
      dataAttribute: options.dataAttribute,
    };
    memoryToasts = [...memoryToasts.filter((t) => t.id !== item.id), item].slice(-5);
    notify();
    return item.id;
  },
  {
    show(options: ToastOptions): string {
      const item: ToastItem = {
        id: options.id || Math.random().toString(36).slice(2, 9),
        title: options.title,
        message: options.message ?? "",
        action: options.action,
        tone: options.tone ?? "info",
        duration: options.duration ?? (options.tone === "error" ? 7000 : 5000),
        dataAttribute: options.dataAttribute,
      };
      memoryToasts = [...memoryToasts.filter((t) => t.id !== item.id), item].slice(-5);
      notify();
      return item.id;
    },

    success(
      titleOrMessage: string,
      messageOrOptions?: ReactNode | Omit<ToastOptions, "tone">,
      options?: Omit<ToastOptions, "tone">
    ): string {
      const item = parseToastArgs("success", titleOrMessage, messageOrOptions, options);
      memoryToasts = [...memoryToasts.filter((t) => t.id !== item.id), item].slice(-5);
      notify();
      return item.id;
    },

    error(
      titleOrMessage: string,
      messageOrOptions?: ReactNode | Omit<ToastOptions, "tone">,
      options?: Omit<ToastOptions, "tone">
    ): string {
      const item = parseToastArgs("error", titleOrMessage, messageOrOptions, options);
      memoryToasts = [...memoryToasts.filter((t) => t.id !== item.id), item].slice(-5);
      notify();
      return item.id;
    },

    info(
      titleOrMessage: string,
      messageOrOptions?: ReactNode | Omit<ToastOptions, "tone">,
      options?: Omit<ToastOptions, "tone">
    ): string {
      const item = parseToastArgs("info", titleOrMessage, messageOrOptions, options);
      memoryToasts = [...memoryToasts.filter((t) => t.id !== item.id), item].slice(-5);
      notify();
      return item.id;
    },

    dismiss(id?: string) {
      if (id) {
        memoryToasts = memoryToasts.filter((t) => t.id !== id);
      } else {
        memoryToasts = [];
      }
      notify();
    },
  }
);

function subscribe(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const emptyToasts: ToastItem[] = [];

function getSnapshot() {
  return memoryToasts;
}

function getServerSnapshot() {
  return emptyToasts;
}

export function useToast() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { toasts, toast };
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <Toast.Provider duration={6000} swipeDirection="right">
      <Portal.Root>
        {toasts.map((item) => {
          const Icon =
            item.tone === "success"
              ? CircleCheck
              : item.tone === "info"
                ? Info
                : CircleAlert;

          return (
            <Toast.Root
              key={item.id}
              duration={item.duration}
              onOpenChange={(open) => {
                if (!open) {
                  toast.dismiss(item.id);
                }
              }}
              type="foreground"
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg transition-all",
                item.tone === "success" && "border-emerald-600/30 bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100",
                item.tone === "error" && "border-red-200 bg-red-50 text-red-950 shadow-md dark:border-destructive/40 dark:bg-red-950/90 dark:text-red-100",
                item.tone === "info" && "border-primary/30 bg-primary/5 text-foreground",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full"
              )}
              {...(item.dataAttribute || {})}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  item.tone === "success" && "text-emerald-600 dark:text-emerald-400",
                  item.tone === "error" && "text-destructive",
                  item.tone === "info" && "text-primary"
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                {item.title && (
                  <Toast.Title className="text-sm font-semibold leading-snug">
                    {item.title}
                  </Toast.Title>
                )}
                {item.message && (
                  <Toast.Description
                    className={cn(
                      "break-words text-sm",
                      item.tone === "success"
                        ? "text-emerald-800 dark:text-emerald-200"
                        : "text-muted-foreground",
                      item.title && "mt-1"
                    )}
                  >
                    {item.message}
                  </Toast.Description>
                )}
                {item.action && (
                  <div className="mt-2.5 flex items-center gap-2">
                    {item.action}
                  </div>
                )}
              </div>
              <Toast.Close
                aria-label="Dismiss notification"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
        <Toast.Viewport
          aria-label="Notifications"
          className="fixed top-20 right-4 z-[100] m-0 flex w-[calc(100vw-2rem)] max-w-sm list-none flex-col gap-3 p-0 outline-none pointer-events-none"
        />
      </Portal.Root>
    </Toast.Provider>
  );
}
