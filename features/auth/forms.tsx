"use client";
import Link from "next/link";
import Image from "next/image";
import { Camera, Upload, UserRound, Save, Trash2, Sparkles, Truck, ShieldAlert } from "lucide-react";
import { prepareProfilePhoto } from "./profile-photo";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { toast } from "@/components/ui/toast";
import { ApiError, errorMessage, fieldErrors } from "@/lib/client/api";
import { useSession } from "./provider";
import { safeReturnUrl } from "./session";
import { authFormSchema, profileFormFields } from "./validation";

export const DEMO_ROLES = [
  {
    role: "ADMIN" as const,
    label: "Admin",
    roleName: "Admin",
    badgeLabel: "Admin",
    email: "admin@gmail.com",
    password: "ExpressHub123!",
    icon: ShieldAlert,
    description: "System stats, courier dispatch, user management & audit trail",
    color: "from-purple-500/10 via-purple-500/5 to-transparent border-purple-200 hover:border-purple-400 dark:border-purple-800/40",
    badgeBg: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
    iconBg: "bg-purple-600 text-white",
  },
  {
    role: "CUSTOMER" as const,
    label: "User (Customer)",
    roleName: "User",
    badgeLabel: "User",
    email: "customer@gmail.com",
    password: "ExpressHub123!",
    icon: UserRound,
    description: "Book parcels, follow tracking & test Stripe checkout",
    color: "from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-200 hover:border-emerald-400 dark:border-emerald-800/40",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
    iconBg: "bg-emerald-600 text-white",
  },
  {
    role: "COURIER" as const,
    label: "Provider (Courier)",
    roleName: "Provider",
    badgeLabel: "Provider",
    email: "courier@gmail.com",
    password: "ExpressHub123!",
    icon: Truck,
    description: "Assigned routes, delivery status transitions & proof notes",
    color: "from-sky-500/10 via-sky-500/5 to-transparent border-sky-200 hover:border-sky-400 dark:border-sky-800/40",
    badgeBg: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
    iconBg: "bg-sky-600 text-white",
  },
];

function useFeedback<T extends FieldValues, Output extends FieldValues>(form: UseFormReturn<T, unknown, Output>, formRef: RefObject<HTMLFormElement | null>) {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const retryAt = error instanceof ApiError ? error.retryAt : 0;
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => clearInterval(id);
  }, [error]);
  function fail(error: unknown) {
    setError(error);
    const fields = fieldErrors(error);
    for (const [name, message] of Object.entries(fields)) form.setError(name as Path<T>, { type: "server", message });
    if (!fields || Object.keys(fields).length === 0) {
      toast.error("We couldn�t complete that request", errorMessage(error), {
        dataAttribute: { "data-form-error": "true" },
      });
    }
    requestAnimationFrame(() => {
      const target = formRef.current?.elements.namedItem(Object.keys(fields)[0]);
      if (target instanceof HTMLElement) target.focus();
      else formRef.current?.querySelector<HTMLElement>("[data-form-error]")?.focus();
    });
  }
  return {
    busy,
    error,
    remaining,
    fail,
    start: () => {
      if (submitting.current || remaining) return false;
      submitting.current = true;
      setBusy(true);
      setError(null);
      form.clearErrors();
      return true;
    },
    finish: () => {
      submitting.current = false;
      setBusy(false);
    },
  };
}
function FormError({
  error: _error,
  remaining: _remaining,
}: {
  error: unknown;
  remaining: number;
}) {
  return null;
}
export function AuthForm({ register = false }: { register?: boolean }) {
  const { store, status, user, error: sessionError } = useSession();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<z.input<ReturnType<typeof authFormSchema>>, unknown, z.output<ReturnType<typeof authFormSchema>>>({
    resolver: zodResolver(authFormSchema(register)),
    defaultValues: register ? { name: "", email: "", password: "", phone: "" } : { email: "", password: "" },
  });
  const feedback = useFeedback(form, formRef);
  const [visible, setVisible] = useState(false);
  const [demoRoleBusy, setDemoRoleBusy] = useState<string | null>(null);

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

  async function handleDemoLogin(demo: (typeof DEMO_ROLES)[number]) {
    if (demoRoleBusy || feedback.busy || feedback.remaining > 0) return;
    if (!feedback.start()) return;
    setDemoRoleBusy(demo.role);

    form.setValue("email", demo.email);
    form.setValue("password", demo.password);

    try {
      const current = await store.authenticate("login", {
        email: demo.email,
        password: demo.password,
      });
      toast.success(
        `Welcome, ${demo.label}`,
        `Signed in as ${current.name || current.email}. Opening ${demo.roleName} workspace�`
      );
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          current.role,
        ),
      );
    } catch (error) {
      feedback.fail(error);
    } finally {
      setDemoRoleBusy(null);
      feedback.finish();
    }
  }

  async function submit(input: { name?: string; email: string; password: string; phone?: string }) {
    if (!feedback.start()) return;
    try {
      const current = await store.authenticate(
        register ? "register" : "login",
        input,
      );
      toast.success(
        register ? "Account created" : "Welcome back",
        register ? "Welcome to ExpressHub!" : `Signed in as ${current.name || current.email}.`
      );
      form.reset();
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          current.role,
        ),
      );
    } catch (error) {
      feedback.fail(error);
    } finally {
      feedback.finish();
    }
  }
  if (status === "loading" || status === "authenticated")
    return (
      <LoadingState
        label={
          status === "loading"
            ? "Checking your session�"
            : "Opening your workspace�"
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
        {!register && (
          <div className="mt-6 rounded-2xl border border-[#d9e1d9] bg-white/70 p-4 shadow-xs backdrop-blur-xs">
            <p className="text-xs font-bold uppercase tracking-wider text-[#196547] mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Demo Evaluation Roles
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center justify-between gap-2 border-b border-[#d9e1d9]/40 pb-1">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-purple-600" />
                  <strong className="text-foreground">Admin:</strong> admin@gmail.com
                </span>
                <span className="text-[10px] rounded bg-purple-100 text-purple-800 px-1.5 py-0.2 font-semibold">ADMIN</span>
              </li>
              <li className="flex items-center justify-between gap-2 border-b border-[#d9e1d9]/40 pb-1">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-600" />
                  <strong className="text-foreground">User:</strong> customer@gmail.com
                </span>
                <span className="text-[10px] rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 font-semibold">CUSTOMER</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-600" />
                  <strong className="text-foreground">Provider:</strong> courier@gmail.com
                </span>
                <span className="text-[10px] rounded bg-sky-100 text-sky-800 px-1.5 py-0.2 font-semibold">COURIER</span>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Password for all: <code className="font-mono font-semibold text-foreground bg-muted px-1 rounded">ExpressHub123!</code>
            </p>
          </div>
        )}
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
              : "Enter your account details or choose a demo role below."}
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

          {!register && (
            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-[#196547]" aria-hidden="true" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#196547]">
                    One-Click Role Login
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
                  Instant demo evaluation
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {DEMO_ROLES.map((demo) => {
                  const Icon = demo.icon;
                  const isCurrentBusy = demoRoleBusy === demo.role;
                  return (
                    <button
                      key={demo.role}
                      type="button"
                      disabled={feedback.busy || Boolean(demoRoleBusy)}
                      onClick={() => void handleDemoLogin(demo)}
                      className={`group relative flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all bg-gradient-to-br ${demo.color} shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <div className="flex w-full items-center justify-between gap-1 mb-2">
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${demo.iconBg} shadow-xs`}>
                          {isCurrentBusy ? (
                            <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
                          ) : (
                            <Icon className="size-4 text-white" aria-hidden="true" />
                          )}
                        </span>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${demo.badgeBg}`}>
                          {demo.badgeLabel}
                        </span>
                      </div>

                      <div className="min-w-0 w-full">
                        <span className="block text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          {isCurrentBusy ? "Signing in�" : `Demo Login: ${demo.roleName}`}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground mt-0.5" title={demo.email}>
                          {demo.email}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="relative my-4 flex items-center">
                <div className="grow border-t border-border" />
                <span className="mx-2 shrink text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Or sign in with email
                </span>
                <div className="grow border-t border-border" />
              </div>
            </div>
          )}

          <form
            ref={formRef}
            onSubmit={form.handleSubmit(submit)}
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
                {...form.register("name")}
                label="Full name"
                autoComplete="name"
                required
                maxLength={100}
                error={form.formState.errors.name?.message}
                disabled={feedback.busy}
              />
            )}
            <Input
              id="email"
              {...form.register("email")}
              label="Email address"
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              error={form.formState.errors.email?.message}
              disabled={feedback.busy}
            />
            <div className="password-field">
              <Input
                id="password"
                {...form.register("password")}
                label="Password"
                type={visible ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                required
                hint={
                  register
                    ? "At least 12 characters, up to 72 UTF-8 bytes."
                    : undefined
                }
                error={form.formState.errors.password?.message}
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
                {...form.register("phone")}
                label="Phone number (optional)"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                error={form.formState.errors.phone?.message}
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
                ? "Please wait�"
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
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<z.input<typeof profileFormFields>, unknown, z.output<typeof profileFormFields>>({
    resolver: zodResolver(profileFormFields),
    defaultValues: { name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", avatar: undefined },
  });
  const feedback = useFeedback(form, formRef);
  useEffect(() => {
    if (user) form.reset({ name: user.name, email: user.email, phone: user.phone ?? "", avatar: undefined });
  }, [user, form.reset]);
  const [saved, setSaved] = useState(false);
  const photoDraft = form.watch("avatar");
  const setPhotoDraft = (value: string | null | undefined) => form.setValue("avatar", value, { shouldDirty: true, shouldValidate: true });
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoPending = useRef(false);
  const photo = photoDraft === undefined ? user?.avatar : photoDraft;
  async function choosePhoto(file?: File) {
    if (!file || photoPending.current) return;
    photoPending.current = true;
    setPhotoBusy(true); setPhotoError(""); setSaved(false);
    try { setPhotoDraft(await prepareProfilePhoto(file)); }
    catch (error) {
      const msg = error instanceof Error ? error.message : "Could not load this photo.";
      setPhotoError(msg);
      toast.error("Profile photo error", msg);
    }
    finally { photoPending.current = false; setPhotoBusy(false); if (photoInput.current) photoInput.current.value = ""; }
  }
  async function submit(input: z.output<typeof profileFormFields>) {
    if (photoPending.current || !feedback.start()) return;
    setSaved(false);
    try {
      const updated = await store.updateProfile(input);
      form.reset({ name: updated.name, email: updated.email, phone: updated.phone ?? "", avatar: undefined });
      setPhotoError("");
      setSaved(true);
      toast.success("Profile updated", "Your changes have been saved.");
    } catch (error) {
      feedback.fail(error);
    } finally {
      feedback.finish();
    }
  }
  if (!user) return null;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">Account settings</p><h1>Your profile</h1><p>Manage your photo and personal details.</p></div>
      </div>
      <form ref={formRef} onSubmit={form.handleSubmit(submit)} onChange={() => setSaved(false)} noValidate aria-busy={feedback.busy || photoBusy} className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="gap-0 overflow-hidden pt-0">
          <div className="h-24 bg-linear-to-br from-[#196547] via-[#287b59] to-[#b2cc98]" />
          <CardContent className="relative -mt-12 space-y-5 text-center">
            <div className="relative mx-auto w-fit">
              <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-sm">
                {photo ? <Image src={photo} alt="Your profile photo" width={112} height={112} unoptimized className="size-full object-cover" /> : <UserRound className="size-12 text-primary/60" aria-hidden="true" />}
              </div>
              <span className="absolute bottom-1 right-0 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"><Camera className="size-4" aria-hidden="true" /></span>
            </div>
            <div className="min-w-0"><h2 className="break-words text-xl font-semibold">{user.name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><span className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{user.role.toLowerCase()}</span></div>
            <div className="space-y-3 border-t pt-5">
              <input ref={photoInput} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Profile photo" disabled={feedback.busy || photoBusy} aria-invalid={Boolean(photoError || form.formState.errors.avatar?.message)} aria-describedby="profile-photo-help profile-photo-error" onChange={event => void choosePhoto(event.target.files?.[0])} />
              <Button type="button" variant="outline" className="w-full" disabled={feedback.busy || photoBusy} onClick={() => photoInput.current?.click()}>
                {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" aria-hidden="true" />}{photoBusy ? "Preparing photo�" : photo ? "Change photo" : "Upload photo"}
              </Button>
              {photo && <Button type="button" variant="ghost" size="sm" disabled={feedback.busy || photoBusy} onClick={() => { setPhotoDraft(null); setPhotoError(""); setSaved(false); }}><Trash2 className="size-3.5" aria-hidden="true" />Remove photo</Button>}
              <p id="profile-photo-help" className="text-xs leading-relaxed text-muted-foreground">JPG, PNG or WebP. Up to 5 MB.<br />Save changes to update your photo.</p>
              <p id="profile-photo-error" role={photoError || form.formState.errors.avatar?.message ? "alert" : undefined} className="text-sm text-destructive">{photoError || form.formState.errors.avatar?.message}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b pb-5">
            <CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary" aria-hidden="true" /><h2 className="text-lg">Personal information</h2></CardTitle>
            <CardDescription>Keep your contact details up to date for your deliveries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 py-6">
            <FormError error={feedback.error} remaining={feedback.remaining} />
            <Input id="profile-name" {...form.register("name")} label="Full name" autoComplete="name" maxLength={100} required disabled={feedback.busy} error={form.formState.errors.name?.message} />
            <div className="grid gap-6 md:grid-cols-2">
              <Input id="profile-email" {...form.register("email")} label="Email address" type="email" autoComplete="email" maxLength={254} required disabled={feedback.busy} error={form.formState.errors.email?.message} />
              <Input id="profile-phone" {...form.register("phone")} label="Phone number (optional)" type="tel" autoComplete="tel" maxLength={30} disabled={feedback.busy} error={form.formState.errors.phone?.message} />
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-medium">Account access</p><p className="mt-1 text-xs text-muted-foreground">Your {user.role.toLowerCase()} role is managed by your administrator.</p></div></div>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t pt-5">
            <Button type="submit" className="h-11 w-full sm:w-auto" disabled={feedback.busy || photoBusy || feedback.remaining > 0}>
              {feedback.busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" aria-hidden="true" />}{feedback.busy ? "Saving�" : "Save changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
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
        {busy ? "Signing out�" : "Sign out"}
      </Button>
    </div>
  );
}
