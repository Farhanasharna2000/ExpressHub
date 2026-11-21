"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useTranslations } from "next-intl";
import { parseTrackingInput, trackingPath } from "./contracts";

export function TrackForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("tracking");
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trackingNumber = parseTrackingInput(value);
    if (!trackingNumber) {
      setError(t("form.invalid"));
      return;
    }
    setError(null);
    router.push(trackingPath(trackingNumber));
  }

  return (
    <form onSubmit={submit} noValidate role="search" aria-label={t("form.label")} className={compact ? "flex flex-col gap-2 sm:flex-row sm:items-start" : "space-y-3"}>
      <div className="flex-1">
        <Input
          id={`${id}-tracking`}
          label={t("trackingNumber")}
          placeholder="EH-0123456789ABCDEF01234567"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error ?? undefined}
          className="font-mono uppercase"
        />
      </div>
      <Button type="submit" className={compact ? "min-h-11 sm:mt-6" : "min-h-11"}>
        <Search aria-hidden="true" /> {t("form.submit")}
      </Button>
    </form>
  );
}
