"use client";

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
import { ErrorNotice, LoadingState, EmptyState } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import type { CurrentUser, UserRole } from "@/types/api";
import { dateTime } from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

export function AdminUserDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user: currentActor, store } = useSession();

  const valid = z.cuid().safeParse(id).success;
  const { data, loading, error, reload } = useResource<{ user: CurrentUser }>(
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
  const deleteForm = useForm({ mode: "onChange", resolver: zodResolver(archiveFormSchema("A deletion reason")), defaultValues: { reason: "" } });
  const deleteReasonError = deleteForm.formState.errors.reason?.message;
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [deletedConfirmed, setDeletedConfirmed] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);

  // Handle Role Change
  async function handleChangeRole() {
    if (!targetUser || isSelf || roleBusy || !await roleForm.trigger()) return;
    setRoleBusy(true);
    setRoleError(null);
    setFeedback(null);
    try {
      await store.api.request(`/users/${encodeURIComponent(id)}/role`, {
        method: "PATCH",
        body: { role: selectedRole },
      });
      const msg = `User role successfully changed to ${selectedRole}.`;
      setFeedback(msg);
      toast.success("Role Updated", msg);
      setRoleModalOpen(false);
      reload();
    } catch (err) {
      setRoleError(err);
      toast.error("Role update failed", errorMessage(err));
    } finally {
      setRoleBusy(false);
    }
  }

  // Handle Status Toggle
  async function handleToggleStatus() {
    if (!targetUser || isSelf || statusBusy) return;
    setStatusBusy(true);
    setStatusError(null);
    setFeedback(null);
    try {
      const nextStatus = !targetUser.isActive;
      await store.api.request(`/users/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { isActive: nextStatus },
      });
      const msg = `Account status successfully changed to ${nextStatus ? "Active" : "Inactive"}.`;
      setFeedback(msg);
      toast.success("Status Updated", msg);
      setStatusModalOpen(false);
      reload();
    } catch (err) {
      setStatusError(err);
      toast.error("Status update failed", errorMessage(err));
    } finally {
      setStatusBusy(false);
    }
  }

  // Handle Soft Deletion
  async function handleSoftDelete() {
    if (!targetUser || isSelf || deleteBusy) return;
    if (!await deleteForm.trigger(undefined, { shouldFocus: true })) return;
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
      toast.success("User Account Archived", "This user has been soft-deleted and archived from active directories.");
      setDeleteModalOpen(false);
    } catch (err) {
      setDeleteError(err);
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "User conflict"
          : "Archival failed",
        errorMessage(err)
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <Link href="/admin/users" className="back-link">
        <ArrowLeft className="inline size-4" aria-hidden="true" /> Back to user directory
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">User Administration</p>
          <h1>Account Profile</h1>
          <p className="font-mono text-sm text-muted-foreground">{id}</p>
        </div>
        {valid && (
          <Button variant="outline" disabled={loading || delay > 0} onClick={reload}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      {deletedConfirmed && (
        <Alert role="status" className="border-amber-600/30 bg-amber-50 text-amber-950">
          <AlertTriangle className="size-4 text-amber-700" />
          <AlertTitle>User Account Archived</AlertTitle>
          <AlertDescription>
            This user has been soft-deleted and archived from active directories.
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">Return to User Directory</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!valid && (
        <EmptyState
          title="Invalid user link"
          description="The user identifier provided is invalid. Return to the directory."
          action={
            <Button asChild>
              <Link href="/admin/users">View all users</Link>
            </Button>
          }
        />
      )}

      {loading && <LoadingState label="Loading user account details…" />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? "User not found"
              : "Could not load user profile"
          }
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? `Retry in ${delay}s` : "Try again"}
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
                <strong>Active Session Identity:</strong> You are currently logged in as this administrator.
                To prevent accidental lockout, administrative self-role changes, self-deactivation, and self-archival are restricted by security policy.
              </div>
            </div>
          )}

          {/* User Profile Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-5" />
                  Profile Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Full Name:</span>
                  <p className="font-semibold text-lg">{targetUser.name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Email Address:</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Mail className="size-3.5 text-muted-foreground" />
                    {targetUser.email}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Phone Number:</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5 text-muted-foreground" />
                    {targetUser.phone || "No phone number registered"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Registration Date:</span>
                  <p className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    {dateTime(targetUser.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="size-5" />
                  Permissions & Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Assigned Role:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold border bg-primary/10 text-primary">
                      {targetUser.role}
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
                        Change Role
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Account State:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                        targetUser.isActive
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {targetUser.isActive ? "Active Account" : "Inactive / Suspended"}
                    </span>
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant={targetUser.isActive ? "outline" : "default"}
                        onClick={() => setStatusModalOpen(true)}
                      >
                        {targetUser.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Destructive Deletion Section */}
                {!isSelf && (
                  <div className="pt-4 border-t space-y-2">
                    <span className="text-xs text-muted-foreground block">
                      Account Soft Deletion
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
                      Archive Account
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Soft-delete removes this user from active operations while preserving audit records.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Change Role Dialog */}
          <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
            <DialogContent showCloseButton={!roleBusy}>
              <DialogHeader>
                <DialogTitle>Update User Role</DialogTitle>
                <DialogDescription>
                  Modify system authority and dashboard permissions for {targetUser.name}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="field">
                  <label htmlFor="select-user-role" className="text-sm font-medium">
                    Select New Role:
                  </label>
                  <select
                    id="select-user-role"
                    {...roleForm.register("role")}
                    disabled={roleBusy}
                    className="w-full h-10 mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="CUSTOMER">Customer (Standard Client)</option>
                    <option value="COURIER">Courier (Delivery Fleet)</option>
                    <option value="ADMIN">Admin (Full System Authority)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" disabled={roleBusy} onClick={() => setRoleModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    disabled={roleBusy || selectedRole === targetUser.role}
                    onClick={() => void handleChangeRole()}
                  >
                    {roleBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                    Confirm Role Change
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Toggle Status Dialog */}
          <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
            <DialogContent showCloseButton={!statusBusy}>
              <DialogHeader>
                <DialogTitle>
                  {targetUser.isActive ? "Deactivate Account" : "Activate Account"}
                </DialogTitle>
                <DialogDescription>
                  {targetUser.isActive
                    ? `Deactivating ${targetUser.name} will revoke their active sessions and prevent future sign-ins.`
                    : `Activating ${targetUser.name} will restore their access to sign in and interact with ExpressHub.`}
                </DialogDescription>
              </DialogHeader>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" disabled={statusBusy} onClick={() => setStatusModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant={targetUser.isActive ? "destructive" : "default"}
                  disabled={statusBusy}
                  onClick={() => void handleToggleStatus()}
                >
                  {statusBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                  {targetUser.isActive ? "Confirm Deactivation" : "Confirm Activation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Soft Delete Account Dialog */}
          <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
            <DialogContent showCloseButton={!deleteBusy}>
              <DialogHeader>
                <DialogTitle>Archive and Soft-Delete User</DialogTitle>
                <DialogDescription>
                  This action archives the user account and revokes active sessions.
                  Active shipments or unresolved payments must be settled before deletion.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="field">
                  <label htmlFor="delete-reason" className="text-sm font-medium">
                    Archival Reason (Required):
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
                    Cancel
                  </Button>
                  <Button variant="destructive" disabled={deleteBusy} onClick={() => void handleSoftDelete()}>
                    {deleteBusy && <Loader2 className="animate-spin size-4 mr-2" />}
                    Confirm Account Archival
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
