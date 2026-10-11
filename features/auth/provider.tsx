"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  return <Context.Provider value={store}>{children}</Context.Provider>;
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
          title="Unable to restore your session"
          action={
            <Button onClick={() => void store.restore()}>Try again</Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
        <ButtonLink href="/login" secondary>
          Go to sign in
        </ButtonLink>
      </main>
    );
  if (status !== "authenticated" || !user)
    return (
      <main id="main-content">
        <LoadingState
          label={
            status === "anonymous"
              ? "Taking you to sign in…"
              : "Restoring your session…"
          }
        />
      </main>
    );
  if (!permittedPath(path, user.role))
    return (
      <main id="main-content" className="narrow-page">
        <ErrorNotice
          title="Access denied"
          action={
            <ButtonLink href={roleHome(user.role)}>
              Go to your workspace
            </ButtonLink>
          }
        >
          This area is not available for your account.
        </ErrorNotice>
      </main>
    );
  return <div key={`${user.id}:${user.role}:${revision}`}>{children}</div>;
}
