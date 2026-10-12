"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogOut,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input, LoadingState } from "@/components/ui/primitives";
import { ApiError, errorMessage, fieldErrors } from "@/lib/client/api";
import { useSession } from "./provider";
import { safeReturnUrl } from "./session";
import { loginFields, registrationFields, profileFields } from "./validation";

function useFeedback() {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const retryAt = error instanceof ApiError ? error.retryAt : 0;
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => clearInterval(id);
  }, [error]);
  function fail(error: unknown, form: HTMLFormElement) {
    setError(error);
    const fields = fieldErrors(error);
    setErrors(fields);
    requestAnimationFrame(() => {
      const target = form.elements.namedItem(Object.keys(fields)[0]);
      if (target instanceof HTMLElement) target.focus();
      else form.querySelector<HTMLElement>("[data-form-error]")?.focus();
    });
  }
  return {
    busy,
    error,
    errors,
    remaining,
    fail,
    start: () => {
      if (submitting.current || remaining) return false;
      submitting.current = true;
      setBusy(true);
      setError(null);
      setErrors({});
      return true;
    },
    finish: () => {
      submitting.current = false;
      setBusy(false);
    },
  };
}
function FormError({
  error,
  remaining,
}: {
  error: unknown;
  remaining: number;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" tabIndex={-1} data-form-error>
      <AlertTitle>We couldn’t complete that request</AlertTitle>
      <AlertDescription>
        {errorMessage(error)}
        {remaining > 0 && (
          <span aria-live="polite">Try again in {remaining} seconds.</span>
        )}
      </AlertDescription>
    </Alert>
  );
}
function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  return new ApiError(
    400,
    "Please check the highlighted fields.",
    issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}

export function AuthForm({ register = false }: { register?: boolean }) {
  const { store, status, user, error: sessionError } = useSession();
  const router = useRouter();
  const feedback = useFeedback();
  const [visible, setVisible] = useState(false);
  const logoutFailed =
    sessionError instanceof ApiError &&
    sessionError.errors.some(
      (issue) =>
        !!issue &&
        typeof issue === "object" &&
        "code" in issue &&
        issue.code === "LOGOUT_FAILED",
    );
  useEffect(() => {
    if (status === "authenticated" && user)
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          user.role,
        ),
      );
  }, [status, user, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback.start()) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      ...(register
        ? {
            name: String(data.get("name") ?? ""),
            ...(String(data.get("phone") ?? "").trim()
              ? { phone: String(data.get("phone")) }
              : {}),
          }
        : {}),
    };
    try {
      const parsed = (register ? registrationFields : loginFields).safeParse(
        input,
      );
      if (!parsed.success) throw validationError(parsed.error.issues);
      const current = await store.authenticate(
        register ? "register" : "login",
        parsed.data,
      );
      form.reset();
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          current.role,
        ),
      );
    } catch (error) {
      feedback.fail(error, form);
    } finally {
      feedback.finish();
    }
  }
  if (status === "loading" || status === "authenticated")
    return (
      <LoadingState
        label={
          status === "loading"
            ? "Checking your session…"
            : "Opening your workspace…"
        }
      />
    );
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="auth-layout"
    >
      <section className="auth-story">
        <span className="auth-icon">
          <PackageCheck size={30} aria-hidden="true" />
        </span>
        <p className="eyebrow">Every delivery, connected</p>
        <h1>
          {register
            ? "Your next chapter, delivered."
            : "Welcome back to your delivery hub."}
        </h1>
        <p>
          Book a parcel, follow its journey, and keep every delivery in one
          place.
        </p>
        <div className="auth-benefit">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>Secure payments. Clear delivery updates.</span>
        </div>
      </section>
      <Card className="auth-card">
        <CardHeader>
          <span className="auth-card-icon">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <CardTitle>
            <h2>
              {register ? "Create your account" : "Sign in to ExpressHub"}
            </h2>
          </CardTitle>
          <CardDescription>
            {register
              ? "Start sending as an ExpressHub customer."
              : "Enter your account details to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logoutFailed && (
            <Alert variant="destructive">
              <AlertTitle>Sign-out was not confirmed</AlertTitle>
              <AlertDescription>
                Your session was cleared on this page, but the server could not
                revoke the cookie. Retry sign-out before leaving a shared
                device.
                <Button
                  type="button"
                  variant="outline"
                  disabled={feedback.busy}
                  onClick={async () => {
                    if (!feedback.start()) return;
                    try {
                      await store.logout();
                      router.replace("/login");
                    } catch {
                      /* Keep the recovery notice visible. */
                    } finally {
                      feedback.finish();
                    }
                  }}
                >
                  Retry sign-out
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={submit}
            noValidate
            className="form-grid"
            aria-busy={feedback.busy}
          >
            <FormError error={feedback.error} remaining={feedback.remaining} />
            {Boolean(sessionError) && !logoutFailed && !feedback.error && (
              <Alert>
                <AlertTitle>Session notice</AlertTitle>
                <AlertDescription>
                  {errorMessage(sessionError)}
                </AlertDescription>
              </Alert>
            )}
            {register && (
              <Input
                id="name"
                name="name"
                label="Full name"
                autoComplete="name"
                required
                maxLength={100}
                error={feedback.errors.name}
                disabled={feedback.busy}
              />
            )}
            <Input
              id="email"
              name="email"
              label="Email address"
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              error={feedback.errors.email}
              disabled={feedback.busy}
            />
            <div className="password-field">
              <Input
                id="password"
                name="password"
                label="Password"
                type={visible ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                required
                hint={
                  register
                    ? "At least 12 characters, up to 72 UTF-8 bytes."
                    : undefined
                }
                error={feedback.errors.password}
                disabled={feedback.busy}
              />
              <Button
                type="button"
                variant="ghost"
                className="password-toggle"
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {register && (
              <Input
                id="phone"
                name="phone"
                label="Phone number (optional)"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                error={feedback.errors.phone}
                disabled={feedback.busy}
              />
            )}
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={feedback.busy || feedback.remaining > 0}
            >
              {feedback.busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {feedback.busy
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t text-sm">
          <span>
            {register ? "Already have an account?" : "New to ExpressHub?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </span>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
export function ProfileForm() {
  const { user, store } = useSession();
  const feedback = useFeedback();
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback.start()) return;
    setSaved(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const parsed = profileFields.safeParse({
        name: data.get("name"),
        email: data.get("email"),
        phone: String(data.get("phone") ?? "").trim() || null,
      });
      if (!parsed.success) throw validationError(parsed.error.issues);
      const updated = await store.updateProfile(parsed.data);
      for (const field of ["name", "email", "phone"] as const) {
        const input = form.elements.namedItem(field);
        if (input instanceof HTMLInputElement)
          input.value = updated[field] ?? "";
      }
      setSaved(true);
    } catch (error) {
      feedback.fail(error, form);
    } finally {
      feedback.finish();
    }
  }
  if (!user) return null;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account settings</p>
          <h1>Your profile</h1>
          <p>Keep your contact details up to date.</p>
        </div>
      </div>
      <Card className="profile-card">
        <CardHeader>
          <CardTitle>
            <h2>Personal information</h2>
          </CardTitle>
          <CardDescription>
            Your account role is {user.role.toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="form-grid"
            onSubmit={submit}
            onChange={() => setSaved(false)}
            noValidate
            aria-busy={feedback.busy}
          >
            <FormError error={feedback.error} remaining={feedback.remaining} />
            {saved && (
              <Alert role="status">
                <CheckCircle2 />
                <AlertTitle>Profile updated</AlertTitle>
                <AlertDescription>
                  Your changes have been saved.
                </AlertDescription>
              </Alert>
            )}
            <Input
              id="profile-name"
              name="name"
              label="Full name"
              defaultValue={user.name}
              autoComplete="name"
              maxLength={100}
              required
              disabled={feedback.busy}
              error={feedback.errors.name}
            />
            <Input
              id="profile-email"
              name="email"
              label="Email address"
              type="email"
              defaultValue={user.email}
              autoComplete="email"
              maxLength={254}
              required
              disabled={feedback.busy}
              error={feedback.errors.email}
            />
            <Input
              id="profile-phone"
              name="phone"
              label="Phone number (optional)"
              type="tel"
              defaultValue={user.phone ?? ""}
              autoComplete="tel"
              maxLength={30}
              disabled={feedback.busy}
              error={feedback.errors.phone}
            />
            <Button
              type="submit"
              className="h-11"
              disabled={feedback.busy || feedback.remaining > 0}
            >
              {feedback.busy && <Loader2 className="animate-spin" />}{" "}
              {feedback.busy ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
export function AccountMenu() {
  const { user, store } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await store.logout();
      router.replace("/login");
    } catch {
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-menu">
      <span>{user?.name}</span>
      <Button
        variant="outline"
        className="h-11"
        disabled={busy}
        onClick={logout}
      >
        <LogOut aria-hidden="true" />
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
