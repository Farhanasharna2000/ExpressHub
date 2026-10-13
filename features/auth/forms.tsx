"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  Camera,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogOut,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  UserRound,
} from "lucide-react";
import { prepareProfilePhoto } from "./profile-photo";
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
    tagline: "Operations & Audits",
    description: "System stats, courier dispatch, user management & audit trail",
    color: "from-purple-500/10 via-purple-500/5 to-transparent border-purple-200 hover:border-purple-400 dark:border-purple-800/40",
    badgeBg: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
    iconBg: "bg-purple-600 text-white",
  },
  {
    role: "CUSTOMER" as const,
    label: "User (Customer)",
    roleName: "Customer",
    badgeLabel: "User",
    email: "customer@gmail.com",
    password: "ExpressHub123!",
    icon: UserRound,
    tagline: "Book & Track Parcels",
    description: "Book parcels, follow tracking & test Stripe checkout",
    color: "from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-200 hover:border-emerald-400 dark:border-emerald-800/40",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
    iconBg: "bg-emerald-600 text-white",
  },
  {
    role: "COURIER" as const,
    label: "Provider (Courier)",
    roleName: "Courier",
    badgeLabel: "Provider",
    email: "courier@gmail.com",
    password: "ExpressHub123!",
    icon: Truck,
    tagline: "Delivery Routes & POD",
    description: "Assigned routes, delivery status transitions & proof notes",
    color: "from-sky-500/10 via-sky-500/5 to-transparent border-sky-200 hover:border-sky-400 dark:border-sky-800/40",
    badgeBg: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
    iconBg: "bg-sky-600 text-white",
  },
];

function useFeedback<T extends FieldValues, Output extends FieldValues>(
  form: UseFormReturn<T, unknown, Output>,
  formRef: RefObject<HTMLFormElement | null>
) {
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
    for (const [name, message] of Object.entries(fields)) {
      form.setError(name as Path<T>, { type: "server", message });
    }
    if (!fields || Object.keys(fields).length === 0) {
      toast.error("We couldn't complete that request", errorMessage(error), {
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
  error,
  remaining,
}: {
  error: unknown;
  remaining: number;
}) {
  if (!error && remaining <= 0) return null;
  const message =
    remaining > 0
      ? `Too many requests. Please wait ${remaining}s before trying again.`
      : errorMessage(error);
  if (!message) return null;

  return (
    <Alert variant="destructive" data-form-error="true" tabIndex={-1}>
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function AuthForm({ register = false }: { register?: boolean }) {
  const { store, status, user, error: sessionError } = useSession();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<
    z.input<ReturnType<typeof authFormSchema>>,
    unknown,
    z.output<ReturnType<typeof authFormSchema>>
  >({
    resolver: zodResolver(authFormSchema(register)),
    defaultValues: register
      ? { name: "", email: "", password: "", phone: "" }
      : { email: "", password: "" },
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
        issue.code === "LOGOUT_FAILED"
    );

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          user.role
        )
      );
    }
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
        `Signed in as ${current.name || current.email}. Opening ${demo.roleName} workspace`
      );
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          current.role
        )
      );
    } catch (error) {
      feedback.fail(error);
    } finally {
      setDemoRoleBusy(null);
      feedback.finish();
    }
  }

  async function submit(input: {
    name?: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    if (!feedback.start()) return;
    try {
      const current = await store.authenticate(
        register ? "register" : "login",
        input
      );
      toast.success(
        register ? "Account created" : "Welcome back",
        register
          ? "Welcome to ExpressHub! Opening your dashboard."
          : `Signed in as ${current.name || current.email}.`
      );
      form.reset();
      router.replace(
        safeReturnUrl(
          new URLSearchParams(window.location.search).get("next"),
          current.role
        )
      );
    } catch (error) {
      feedback.fail(error);
    } finally {
      feedback.finish();
    }
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <LoadingState
        label={
          status === "loading"
            ? "Checking your session"
            : "Opening your workspace"
        }
      />
    );
  }

  return (
    <div className="auth-page flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* ================= STORYSET ANIMATED ILLUSTRATION PANEL (Desktop) ================= */}
          <div className="hidden lg:flex lg:col-span-5 flex-col items-center justify-center p-8 rounded-3xl bg-gradient-to-br from-[#f2f7f0] via-[#e5ecdf]/80 to-[#dce7d9]/60 border border-[var(--line)] shadow-sm relative overflow-hidden text-center">
            {/* Ambient background glows */}
            <div className="pointer-events-none absolute -top-16 -left-16 size-48 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full bg-[#196547]/10 blur-3xl" />

            <motion.div
              animate={{ y: [-6, 6, -6] }}
              transition={{ repeat: Infinity, duration: 4.2, ease: "easeInOut" }}
              className="relative w-full max-w-[280px] aspect-square flex items-center justify-center"
            >
              <Image
                src={register ? "/storyset-signup.svg" : "/storyset-login.svg"}
                alt={register ? "Sign up illustration" : "Login illustration"}
                width={320}
                height={320}
                unoptimized
                priority
                className="w-full h-auto object-contain drop-shadow-sm select-none"
              />
            </motion.div>

            <div className="mt-4 space-y-1.5 relative z-10">
              <h3 className="text-lg font-bold text-foreground">
                {register ? "Join ExpressHub" : "Welcome Back"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
                {register
                  ? "Book doorstep pickups, track parcels live, and manage deliveries effortlessly."
                  : "Access your logistics workspace, courier routes, and real-time updates."}
              </p>
            </div>


          </div>

          {/* ================= AUTH FORM CARD ================= */}
          <div className="lg:col-span-7 w-full max-w-[440px] mx-auto">
            <Card className="rounded-2xl border border-border/80 bg-card shadow-lg sm:shadow-xl">
              <CardHeader className="pt-6 pb-4 px-6 text-center space-y-2">
                {/* Mobile Animated Illustration */}
                <div className="lg:hidden flex justify-center pb-1">
                  <motion.div
                    animate={{ y: [-4, 4, -4] }}
                    transition={{ repeat: Infinity, duration: 3.8, ease: "easeInOut" }}
                  >
                    <Image
                      src={register ? "/storyset-signup.svg" : "/storyset-login.svg"}
                      alt={register ? "Sign up illustration" : "Login illustration"}
                      width={120}
                      height={120}
                      unoptimized
                      priority
                      className="size-24 object-contain select-none drop-shadow-xs"
                    />
                  </motion.div>
                </div>

                <div className="hidden lg:flex justify-center">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <LockKeyhole className="size-5" aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                    {register ? "Create your account" : "Sign in to ExpressHub"}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {register
                      ? "Enter your details below to get started with ExpressHub"
                      : "Welcome back! Please enter your details to continue"}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-0 space-y-4">
                {logoutFailed && (
                  <Alert variant="destructive">
                    <AlertTitle>Sign-out was not confirmed</AlertTitle>
                    <AlertDescription className="text-xs">
                      Your session was cleared on this page, but the server could not
                      revoke the cookie. Retry sign-out before leaving a shared device.
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={feedback.busy}
                          onClick={async () => {
                            if (!feedback.start()) return;
                            try {
                              await store.logout();
                              router.replace("/login");
                            } catch {
                              /* Keep recovery notice visible */
                            } finally {
                              feedback.finish();
                            }
                          }}
                        >
                          Retry sign-out
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {Boolean(sessionError) && !logoutFailed && !feedback.error && (
                  <Alert>
                    <AlertTitle>Session notice</AlertTitle>
                    <AlertDescription className="text-xs">
                      {errorMessage(sessionError)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Quick Demo Sign-in for evaluation (Login only) */}
                {!register && (
                  <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-muted-foreground flex items-center gap-1.5 text-primary">
                        <Sparkles className="size-3.5" aria-hidden="true" /> Demo Sign-in
                      </span>
                      <span className="text-[11px] text-muted-foreground">1-click access</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {DEMO_ROLES.map((demo) => {
                        const isBusy = demoRoleBusy === demo.role;
                        return (
                          <button
                            key={demo.role}
                            type="button"
                            disabled={feedback.busy || Boolean(demoRoleBusy)}
                            onClick={() => void handleDemoLogin(demo)}
                            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-border/60 bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                            title={`Sign in as ${demo.roleName} (${demo.email})`}
                          >
                            {isBusy ? (
                              <Loader2 className="size-3 animate-spin text-primary" />
                            ) : (
                              <span
                                className={`size-1.5 rounded-full ${
                                  demo.role === "ADMIN"
                                    ? "bg-purple-600"
                                    : demo.role === "COURIER"
                                    ? "bg-sky-600"
                                    : "bg-emerald-600"
                                }`}
                              />
                            )}
                            <span>{demo.roleName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <form
                  ref={formRef}
                  onSubmit={form.handleSubmit(submit)}
                  noValidate
                  className="space-y-4"
                  aria-busy={feedback.busy}
                >
                  <FormError error={feedback.error} remaining={feedback.remaining} />

                  {register && (
                    <div>
                      <Input
                        id="name"
                        {...form.register("name")}
                        label="Full name"
                        placeholder="e.g. Sarah Jenkins"
                        autoComplete="name"
                        required
                        maxLength={100}
                        error={form.formState.errors.name?.message}
                        disabled={feedback.busy}
                      />
                    </div>
                  )}

                  <div>
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
                  </div>

                  <div className="password-field relative">
                    <Input
                      id="password"
                      {...form.register("password")}
                      label="Password"
                      type={visible ? "text" : "password"}
                      placeholder={register ? "At least 12 characters" : "••••••••••••"}
                      autoComplete={register ? "new-password" : "current-password"}
                      required
                      error={form.formState.errors.password?.message}
                      disabled={feedback.busy}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="password-toggle absolute right-1 bottom-1 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>

                  {register && (
                    <div>
                      <Input
                        id="phone"
                        {...form.register("phone")}
                        label="Phone number (optional)"
                        placeholder="+880 1700 000000"
                        type="tel"
                        autoComplete="tel"
                        maxLength={30}
                        error={form.formState.errors.phone?.message}
                        disabled={feedback.busy}
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold text-white bg-primary hover:bg-[#135038] rounded-xl transition-colors cursor-pointer"
                    disabled={feedback.busy || feedback.remaining > 0}
                  >
                    {feedback.busy ? (
                      <Loader2 className="size-4 animate-spin mr-2" aria-hidden="true" />
                    ) : null}
                    <span>
                      {feedback.busy
                        ? "Please wait…"
                        : register
                        ? "Create account"
                        : "Sign in"}
                    </span>
                  </Button>
                </form>
              </CardContent>

              <CardFooter className="justify-center border-t border-border/60 py-4 px-6 text-xs text-muted-foreground">
                {register ? (
                  <span>
                    Already have an account?{" "}
                    <Link
                      href="/login"
                      className="font-semibold text-primary hover:underline"
                    >
                      Sign in
                    </Link>
                  </span>
                ) : (
                  <span>
                    Don't have an account?{" "}
                    <Link
                      href="/register"
                      className="font-semibold text-primary hover:underline"
                    >
                      Create account
                    </Link>
                  </span>
                )}
              </CardFooter>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function ProfileForm() {
  const { user, store } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<z.input<typeof profileFormFields>, unknown, z.output<typeof profileFormFields>>({
    resolver: zodResolver(profileFormFields),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      avatar: undefined,
    },
  });
  const feedback = useFeedback(form, formRef);

  // Track user id so background revalidations (e.g. window focus when file chooser closes) never wipe form/avatar draft
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (user && prevUserIdRef.current !== user.id) {
      prevUserIdRef.current = user.id;
      form.reset({
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        avatar: undefined,
      });
    }
  }, [user, form.reset]);

  const [saved, setSaved] = useState(false);
  const photoDraft = form.watch("avatar");
  const setPhotoDraft = (value: string | null | undefined) =>
    form.setValue("avatar", value, { shouldDirty: true, shouldValidate: true });
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoPending = useRef(false);
  const photo = photoDraft === undefined ? user?.avatar : photoDraft;

  async function choosePhoto(file?: File) {
    if (!file || photoPending.current) return;
    photoPending.current = true;
    setPhotoBusy(true);
    setPhotoError("");
    setSaved(false);
    try {
      setPhotoDraft(await prepareProfilePhoto(file));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not load this photo.";
      setPhotoError(msg);
      toast.error("Profile photo error", msg);
    } finally {
      photoPending.current = false;
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function submit(input: z.output<typeof profileFormFields>) {
    if (photoPending.current || !feedback.start()) return;
    setSaved(false);
    try {
      const updated = await store.updateProfile(input);
      form.reset({
        name: updated.name,
        email: updated.email,
        phone: updated.phone ?? "",
        avatar: undefined,
      });
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
        <div>
          <p className="eyebrow">Account settings</p>
          <h1>Your profile</h1>
          <p>Manage your photo and personal details.</p>
        </div>
      </div>
      <form
        ref={formRef}
        onSubmit={form.handleSubmit(submit)}
        onChange={() => setSaved(false)}
        noValidate
        aria-busy={feedback.busy || photoBusy}
        className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"
      >
        <Card className="gap-0 overflow-hidden pt-0">
          <div className="h-24 bg-linear-to-br from-[#196547] via-[#287b59] to-[#b2cc98]" />
          <CardContent className="relative -mt-12 space-y-5 text-center">
            <div className="relative mx-auto w-fit">
              <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-sm">
                {photo ? (
                  <Image
                    src={photo}
                    alt="Your profile photo"
                    width={112}
                    height={112}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-12 text-primary/60" aria-hidden="true" />
                )}
              </div>
              <span className="absolute bottom-1 right-0 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                <Camera className="size-4" aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold">{user.name}</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
              <span className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                {user.role.toLowerCase()}
              </span>
            </div>
            <div className="space-y-3 border-t pt-5">
              <input
                ref={photoInput}
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg,image/pjpeg,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                tabIndex={-1}
                aria-label="Profile photo"
                disabled={feedback.busy || photoBusy}
                aria-invalid={Boolean(photoError || form.formState.errors.avatar?.message)}
                aria-describedby="profile-photo-help profile-photo-error"
                onChange={(event) => void choosePhoto(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={feedback.busy || photoBusy}
                onClick={() => photoInput.current?.click()}
              >
                {photoBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {photoBusy ? "Preparing photo..." : photo ? "Change photo" : "Upload photo"}
              </Button>
              {photo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={feedback.busy || photoBusy}
                  onClick={() => {
                    setPhotoDraft(null);
                    setPhotoError("");
                    setSaved(false);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove photo
                </Button>
              )}

              <p id="profile-photo-help" className="text-xs leading-relaxed text-muted-foreground">
                JPG, PNG or WebP. Up to 5 MB.<br />
                Save changes to update your photo.
              </p>
              <p
                id="profile-photo-error"
                role={photoError || form.formState.errors.avatar?.message ? "alert" : undefined}
                className="text-sm text-destructive"
              >
                {photoError || form.formState.errors.avatar?.message}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="border-b pb-5">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg">Personal information</h2>
            </CardTitle>
            <CardDescription>
              Keep your contact details up to date for your deliveries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 py-6">
            <FormError error={feedback.error} remaining={feedback.remaining} />
            <Input
              id="profile-name"
              {...form.register("name")}
              label="Full name"
              autoComplete="name"
              maxLength={100}
              required
              disabled={feedback.busy}
              error={form.formState.errors.name?.message}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <Input
                id="profile-email"
                {...form.register("email")}
                label="Email address"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                disabled={feedback.busy}
                error={form.formState.errors.email?.message}
              />
              <Input
                id="profile-phone"
                {...form.register("phone")}
                label="Phone number (optional)"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                disabled={feedback.busy}
                error={form.formState.errors.phone?.message}
              />
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Account access</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your {user.role.toLowerCase()} role is managed by your administrator.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t pt-5">
            <Button
              type="submit"
              className="h-11 w-full sm:w-auto"
              disabled={feedback.busy || photoBusy || feedback.remaining > 0}
            >
              {feedback.busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {feedback.busy ? "Saving..." : "Save changes"}
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
      {user && (
        <Link
          href="/profile"
          className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-[#e5ecdf]/60 transition-colors border border-[var(--line)] text-inherit no-underline"
          title={`View profile (${user.email})`}
        >
          <div className="size-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-[var(--line)]">
            <Image
              src={user.avatar || "/avatar-placeholder.svg"}
              alt={user.name}
              width={28}
              height={28}
              unoptimized={Boolean(user.avatar)}
              className="size-full object-cover"
            />
          </div>
          <span className="text-xs font-semibold max-w-[130px] truncate text-[var(--ink)]">
            {user.name}
          </span>
        </Link>
      )}
      <Button
        variant="outline"
        className="h-9 px-3 gap-1.5 text-xs font-semibold"
        disabled={busy}
        onClick={logout}
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        {busy ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}
