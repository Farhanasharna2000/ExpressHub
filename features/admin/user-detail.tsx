"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { archiveFormSchema, roleFormSchema } from "@/lib/client/form-schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { z } from "zod";
import { User, Shield, Phone, Mail, Calendar, AlertTriangle, Loader2, RefreshCw, CheckCircle, ShieldAlert, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorNotice, EmptyState } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import type { CurrentUser, UserRole } from "@/types/api";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
export function AdminUserDetailView({ id }: { id: string }) {
  const t = useTranslations("admin.userDetail");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  const router = useRouter();
  const { user: currentActor, store } = useSession();

  const valid = z.cuid().safeParse(id).success;
  const { data, loading, refreshing, error, reload } = useResource<{ user: CurrentUser }>(
    valid ? `/users/${encodeURIComponent(id)}` : null
  );
  const delay = useRetryDelay(error);
  const targetUser = data?.user;

  const isSelf = currentActor?.id === id;

  // Role modification state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const roleForm = useForm({ mode: "onChange", resolver: zodResolver(roleFormSchema), defaultValues: { role: "CUSTOMER" as UserRole } });
  const selectedRole = roleForm.watch("role");
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState<unknown>(null);

  // Status toggle state
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<unknown>(null);

  // Soft delete state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const deleteForm = useForm({ mode: "onChange", resolver: zodResolver(archiveFormSchema(t("aDeletionReason"))), defaultValues: { reason: "" } });
  const deleteReasonError = deleteForm.formState.errors.reason?.message;
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [deletedConfirmed, setDeletedConfirmed] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  // Set synchronously before any await so a double click can't send a second request.
  const pendingRef = useRef(false);
  const unlessPending = (setOpen: (open: boolean) => void) => (open: boolean) => {
    if (!pendingRef.current) setOpen(open);
  };

  // Handle Role Change
  async function handleChangeRole() {
    if (!targetUser || isSelf || pendingRef.current) return;
    if (!await roleForm.trigger() || pendingRef.current) return;
    pendingRef.current = true;
    setRoleBusy(true);
    setRoleError(null);
    setFeedback(null);
    try {
      await store.api.request(`/users/${encodeURIComponent(id)}/role`, {
        method: "PATCH",
        body: { role: selectedRole },
      });
      const msg = t("roleChanged", { role: statusLabel(selectedRole) });
      setFeedback(msg);
      toast.success(t("roleUpdated"), msg);
      setRoleModalOpen(false);
      reload();
    } catch (err) {
      setRoleError(err);
      toast.error(t("roleUpdateFailed"), errorMessage(err));
    } finally {
      pendingRef.current = false;
      setRoleBusy(false);
    }
  }

  // Handle Status Toggle
  async function handleToggleStatus() {
    if (!targetUser || isSelf || pendingRef.current) return;
    pendingRef.current = true;
    setStatusBusy(true);
    setStatusError(null);
    setFeedback(null);
    try {
      const nextStatus = !targetUser.isActive;
      await store.api.request(`/users/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { isActive: nextStatus },
      });
      const msg = t("statusChanged", { status: nextStatus ? t("active") : t("inactive") });
      setFeedback(msg);
      toast.success(t("statusUpdated"), msg);
      setStatusModalOpen(false);
      reload();
    } catch (err) {
      setStatusError(err);
      toast.error(t("statusUpdateFailed"), errorMessage(err));
    } finally {
      pendingRef.current = false;
      setStatusBusy(false);
    }
  }

  // Handle Soft Deletion
  async function handleSoftDelete() {
    if (!targetUser || isSelf || pendingRef.current) return;
    if (!await deleteForm.trigger(undefined, { shouldFocus: true }) || pendingRef.current) return;
    pendingRef.current = true;
    const cleanReason = deleteForm.getValues("reason").trim();

    setDeleteBusy(true);
    setDeleteError(null);
    setFeedback(null);
    try {
      await store.api.request(`/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: { reason: cleanReason },
      });
      setDeletedConfirmed(true);
      toast.success(t("userAccountArchived"), t("thisUserHasBeen"));
      setDeleteModalOpen(false);
    } catch (err) {
      setDeleteError(err);
      toast.error(
        err instanceof ApiError && err.status === 409
          ? t("userConflict")
          : t("archivalFailed"),
        errorMessage(err)
      );
    } finally {
      pendingRef.current = false;
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <Link href="/admin/users" className="back-link">
        <ArrowLeft className="inline size-4" aria-hidden="true" /> {t("back")}
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("userAdministration")}</p>
          <h1>{t("accountProfile")}</h1>
          <p className="font-mono text-sm text-muted-foreground">{id}</p>
        </div>
        {valid && (
          <Button variant="outline" disabled={loading || refreshing || delay > 0} onClick={reload}>
            <RefreshCw className={`size-4 mr-2 ${loading || refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
        )}
      </div>

      {deletedConfirmed && (
        <Alert role="status" className="border-amber-600/30 bg-amber-50 text-amber-950">
          <AlertTriangle className="size-4 text-amber-700" />
          <AlertTitle>{t("userAccountArchived")}</AlertTitle>
          <AlertDescription>
            {t("thisUserHasBeen")}
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">{t("returnToDirectory")}</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!valid && (
        <EmptyState
          title={t("invalidUserLink")}
          description={t("theUserIdentifierProvided")}
          action={
            <Button asChild>
              <Link href="/admin/users">{t("viewAllUsers")}</Link>
            </Button>
          }
        />
      )}

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="detail" label={t("loadingUserAccountDetails")} />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? t("userNotFound")
              : t("couldNotLoadUser")
          }
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? tf("retryIn", { seconds: f.digits(delay) }) : t("tryAgain")}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {targetUser && !deletedConfirmed && (
        <>
          {/* Self-protection notice */}
          {isSelf && (
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-950 flex items-start gap-2 text-sm">
              <ShieldAlert className="size-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                {t.rich("selfNotice", { b: (chunks) => <strong>{chunks}</strong> })}
              </div>
            </div>
          )}

          {/* User Profile Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-5" />
                  {t("profileInformation")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("fullName")}</span>
                  <p className="font-semibold text-lg">{targetUser.name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("emailAddress")}</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Mail className="size-3.5 text-muted-foreground" />
                    {targetUser.email}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("phoneNumber")}</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5 text-muted-foreground" />
                    {targetUser.phone || t("noPhoneNumberRegistered")}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("registrationDate")}</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    {f.dateTime(targetUser.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="size-5" />
                  {t("permissionsStatus")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("assignedRole")}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold border bg-primary/10 text-primary">
                      {statusLabel(targetUser.role)}
                    </span>
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          roleForm.reset({ role: targetUser.role });
                          setRoleModalOpen(true);
                        }}
                      >
                        {t("changeRole")}
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">{t("accountState")}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                        targetUser.isActive
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {targetUser.isActive ? t("activeAccount") : t("inactiveSuspended")}
                    </span>
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant={targetUser.isActive ? "outline" : "default"}
                        onClick={() => setStatusModalOpen(true)}
                      >
                        {targetUser.isActive ? t("deactivate") : t("activate")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Destructive Deletion Section */}
                {!isSelf && (
                  <div className="pt-4 border-t space-y-2">
                    <span className="text-xs text-muted-foreground block">
                      {t("accountSoftDeletion")}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        deleteForm.reset();
                        setDeleteModalOpen(true);
                      }}
                    >
                      <Trash2 className="size-4 mr-1.5" />
                      {t("archiveAccount")}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t("softDeleteRemovesThis")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Change Role Dialog */}
          <Dialog open={roleModalOpen} onOpenChange={unlessPending(setRoleModalOpen)}>
            <DialogContent showCloseButton={!roleBusy}>
              <DialogHeader>
                <DialogTitle>{t("updateUserRole")}</DialogTitle>
                <DialogDescription>
                  {t("roleIntro", { name: targetUser.name })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="field">
                  <label htmlFor="select-user-role" className="text-sm font-medium">
                    {t("selectRole")}
                  </label>
                  <select
                    id="select-user-role"
                    {...roleForm.register("role")}
                    disabled={roleBusy}
                    className="w-full h-10 mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="CUSTOMER">{t("customerStandardClient")}</option>
                    <option value="COURIER">{t("courierDeliveryFleet")}</option>
                    <option value="ADMIN">{t("adminFullSystemAuthority")}</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" disabled={roleBusy} onClick={() => setRoleModalOpen(false)}>
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="default"
                    disabled={roleBusy || selectedRole === targetUser.role}
                    onClick={() => void handleChangeRole()}
                  >
                    {roleBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                    {t("confirmRoleChange")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Toggle Status Dialog */}
          <Dialog open={statusModalOpen} onOpenChange={unlessPending(setStatusModalOpen)}>
            <DialogContent showCloseButton={!statusBusy}>
              <DialogHeader>
                <DialogTitle>
                  {targetUser.isActive ? t("deactivateAccount") : t("activateAccount")}
                </DialogTitle>
                <DialogDescription>
                  {targetUser.isActive
                    ? t("deactivateIntro", { name: targetUser.name })
                    : t("activateIntro", { name: targetUser.name })}
                </DialogDescription>
              </DialogHeader>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" disabled={statusBusy} onClick={() => setStatusModalOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant={targetUser.isActive ? "destructive" : "default"}
                  disabled={statusBusy}
                  onClick={() => void handleToggleStatus()}
                >
                  {statusBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                  {targetUser.isActive ? t("confirmDeactivation") : t("confirmActivation")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Soft Delete Account Dialog */}
          <Dialog open={deleteModalOpen} onOpenChange={unlessPending(setDeleteModalOpen)}>
            <DialogContent showCloseButton={!deleteBusy}>
              <DialogHeader>
                <DialogTitle>{t("archiveAndSoftDelete")}</DialogTitle>
                <DialogDescription>
                  {t("archiveIntro")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="field">
                  <label htmlFor="delete-reason" className="text-sm font-medium">
                    {t("archiveReason")}
                  </label>
                  <textarea
                    id="delete-reason"
                    rows={3}
                    {...deleteForm.register("reason")}
                    aria-invalid={Boolean(deleteReasonError)}
                    aria-describedby={deleteReasonError ? "delete-reason-error" : undefined}
                    disabled={deleteBusy}
                    className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  {deleteReasonError && (
                    <p id="delete-reason-error" role="alert" className="text-xs text-destructive mt-1">{deleteReasonError}</p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteModalOpen(false)}>
                    {t("cancel")}
                  </Button>
                  <Button variant="destructive" disabled={deleteBusy} onClick={() => void handleSoftDelete()}>
                    {deleteBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                    {t("confirmAccountArchival")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
