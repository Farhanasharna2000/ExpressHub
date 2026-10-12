"use client";

import { Toast, Portal } from "radix-ui";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export function NotificationToast({ open, onOpenChange, title, message, tone = "error" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  tone?: "error" | "success";
}) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <Toast.Provider duration={10000} swipeDirection="right">
      <Portal.Root>
        <Toast.Root open={open} onOpenChange={onOpenChange} type="foreground"
          className={`flex items-start gap-3 rounded-xl border bg-background p-4 text-foreground shadow-lg ${tone === "success" ? "border-emerald-600/25" : "border-destructive/25"}`}>
          <Icon className={`mt-0.5 size-5 shrink-0 ${tone === "success" ? "text-emerald-600" : "text-destructive"}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-sm font-semibold">{title}</Toast.Title>
            <Toast.Description className="mt-1 break-words text-sm text-muted-foreground">{message}</Toast.Description>
          </div>
          <Toast.Close aria-label="Dismiss notification" className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
        <Toast.Viewport aria-label="Notifications" className="fixed top-4 right-4 z-[100] m-0 flex w-[calc(100vw-2rem)] max-w-sm list-none flex-col gap-3 p-0 outline-none" />
      </Portal.Root>
    </Toast.Provider>
  );
}
