"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  SessionStore,
  initialSession,
  permittedPath,
  roleHome,
} from "./session";
import {
  Button,
  ButtonLink,
  ErrorNotice,
  LoadingState,
} from "@/components/ui/primitives";
import { errorMessage } from "@/lib/client/api";

const Context = createContext<SessionStore | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new SessionStore());
  useEffect(() => {
    void store.restore();
    const check = () => {
      if (document.visibilityState === "visible") void store.revalidate();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 60_000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [store]);
  return <Context.Provider value={store}><QueryClientProvider client={store.queryClient}>{children}</QueryClientProvider></Context.Provider>;
}
export function useSession() {
  const store = useContext(Context);
  if (!store) throw new Error("SessionProvider is required");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => initialSession,
  );
  return { ...state, store };
}
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations("authGate");
  const { status, user, error, revision, store } = useSession();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous")
      router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [status, path, router]);
  useEffect(() => {
    void store.revalidate();
  }, [store, path]);
  if (status === "error")
    return (
      <main id="main-content" className="narrow-page">
        <ErrorNotice
          title={t("restoreFailed")}
          action={
            <Button onClick={() => void store.restore()}>{t("tryAgain")}</Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
        <ButtonLink href="/login" secondary>
          {t("goToSignIn")}
        </ButtonLink>
      </main>
    );
  if (status !== "authenticated" || !user)
    return (
      <main id="main-content" className="flex min-h-dvh items-center justify-center px-4 text-center">
        <LoadingState
          label={
            status === "anonymous" ? t("redirecting") : t("loading")
          }
        />
      </main>
    );
  if (!permittedPath(path, user.role))
    return (
      <main id="main-content" className="narrow-page">
        <ErrorNotice
          title={t("accessDenied")}
          action={
            <ButtonLink href={roleHome(user.role)}>
              {t("goToWorkspace")}
            </ButtonLink>
          }
        >
          {t("notAvailable")}
        </ErrorNotice>
      </main>
    );
  return <div key={`${user.id}:${user.role}:${revision}`}>{children}</div>;
}
