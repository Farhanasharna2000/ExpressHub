"use client";

import { useEffect, useRef } from "react";
import { toast, type ToastTone } from "./toast";

export { toast, useToast, Toaster } from "./toast";

export function NotificationToast({
  open,
  onOpenChange,
  title,
  message,
  tone = "error",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  tone?: "error" | "success";
}) {
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && message) {
      toastIdRef.current = toast.show({
        id: toastIdRef.current || undefined,
        title,
        message,
        tone: tone as ToastTone,
      });
    } else if (!open && toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [open, title, message, tone]);

  return null;
}
