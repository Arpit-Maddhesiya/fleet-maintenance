"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2Icon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldIcon,
  AlertTriangleIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, fieldErrorsOf, firstFieldError } from "@/lib/api-client";
import type { ApiFieldErrors } from "@/lib/api-client";
import type { CreateUserInput, UserRow } from "@/lib/types";

/** Role name to a short label + badge styling. */
const ROLE_META: Record<string, { label: string; icon: typeof ShieldIcon }> = {
  FLEET_MANAGER: { label: "Fleet manager", icon: ShieldIcon },
  TECHNICIAN: { label: "Technician", icon: WrenchIcon },
};

const ROLE_OPTIONS: { value: CreateUserInput["role"]; label: string }[] = [
  { value: "FLEET_MANAGER", label: "Fleet manager" },
  { value: "TECHNICIAN", label: "Technician" },
];

interface FormValues {
  name: string;
  email: string;
  password: string;
  role: CreateUserInput["role"] | "";
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

const EMPTY_FORM: FormValues = { name: "", email: "", password: "", role: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  // Client-side search over the loaded users (name/email/role).
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<UserRow[]>("/api/users");
      setUsers(data);
      setLoadError(null);
    } catch (error) {
      setUsers([]);
      setLoadError(
        error instanceof Error ? error.message : "Failed to load users."
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  // Case-insensitive match on name, email, or role label.
  const needle = query.trim().toLowerCase();
  const filtered =
    users === null
      ? null
      : needle.length === 0
        ? users
        : users.filter((user) =>
            [user.name, user.email, ROLE_META[user.role]?.label ?? user.role]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage fleet managers and technicians.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, role…"
              className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-72"
              aria-label="Search users"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {users === null
              ? "Loading users…"
              : needle.length > 0
                ? `${filtered?.length ?? 0} of ${users.length} user${users.length === 1 ? "" : "s"}`
                : `${users.length} user${users.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" aria-hidden />
          Add user
        </Button>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          <RefreshCwIcon className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{loadError}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      ) : users === null ? (
        <UserSkeleton />
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <UsersIcon className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No users yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Add your first fleet manager or technician to get started.
            </p>
          </div>
        </div>
      ) : (filtered?.length ?? 0) === 0 ? (
        // The list loaded, but nothing matches the search query.
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchIcon className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              No users match &ldquo;{query.trim()}&rdquo;
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Try a different name, email, or role.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: card-framed table. Mobile: one card per user. */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active assignments</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered!.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <UserRoundIcon className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          user.activeAssignments > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {user.activeAssignments}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(user)}
                      >
                        <Trash2Icon className="size-4" aria-hidden />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered!.map((user) => (
              <li key={user.id} className="overflow-hidden rounded-2xl border bg-card">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <UserRoundIcon className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <RoleBadge role={user.role} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-sm text-muted-foreground">
                  <span>
                    {user.activeAssignments} active assignment
                    {user.activeAssignments === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(user)}
                  >
                    <Trash2Icon className="size-4" aria-hidden />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />

      <DeleteUserDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? { label: role, icon: UserRoundIcon };
  const Icon = meta.icon;
  return (
    <Badge
      variant={role === "FLEET_MANAGER" ? "default" : "secondary"}
      className="gap-1.5"
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

// ----- Create-user dialog -------------------------------------------------

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setValues(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (values.name.trim().length === 0) next.name = "Name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (values.password.length < 8) {
      next.password = "Password must be at least 8 characters";
    }
    if (!values.role) next.role = "Choose a role";
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const body: CreateUserInput = {
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role as CreateUserInput["role"],
      };
      await apiFetch("/api/users", { method: "POST", body });
      toast.success("User created");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      const serverErrors = fieldErrorsOf(error);
      if (serverErrors) {
        setErrors(mergeServerErrors(serverErrors));
      } else {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function mergeServerErrors(serverErrors: ApiFieldErrors): FieldErrors {
    const merged: FieldErrors = {};
    for (const field of ["name", "email", "password", "role"] as const) {
      const message = firstFieldError(serverErrors, field);
      if (message) merged[field] = message;
    }
    return merged;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a fleet manager or technician account. The new user signs in
            with the email and password you set here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Name</Label>
            <Input
              id="user-name"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Jordan Smith"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <div className="relative">
              <MailIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="user-email"
                type="email"
                autoComplete="off"
                className="pl-9"
                value={values.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="name@company.com"
                aria-invalid={Boolean(errors.email)}
              />
            </div>
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Temporary password</Label>
            <Input
              id="user-password"
              type="text"
              autoComplete="new-password"
              value={values.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="At least 8 characters"
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={values.role || undefined}
              onValueChange={(role) =>
                setField("role", role as CreateUserInput["role"])
              }
            >
              <SelectTrigger
                id="user-role"
                className="w-full"
                aria-invalid={Boolean(errors.role)}
              >
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role ? (
              <p className="text-sm text-destructive">{errors.role}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                "Create user"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----- Delete-user dialog ------------------------------------------------
//
// A destructive confirmation built on AlertDialog (not a plain Dialog) so
// screen readers announce it as an alert and the user is forced to make an
// explicit choice. It dismisses like any alert — Esc, overlay click, or the
// Cancel button — and only the confirm button performs the delete.

interface DeleteUserDialogProps {
  user: UserRow | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteUserDialog({ user, onClose, onDeleted }: DeleteUserDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) setSubmitting(false);
  }, [user]);

  async function handleDelete() {
    if (!user) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      toast.success(`${user.name} deleted`);
      onClose();
      onDeleted();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete user."
      );
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <Trash2Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <AlertDialogHeader className="gap-1.5">
              <AlertDialogTitle>Delete user?</AlertDialogTitle>
              {user ? (
                <AlertDialogDescription>
                  You&apos;re about to permanently delete{" "}
                  <span className="font-medium text-foreground">{user.name}</span>{" "}
                  ({user.email}). This action cannot be undone.
                </AlertDialogDescription>
              ) : (
                <AlertDialogDescription>
                  This action cannot be undone.
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>

            {user && user.activeAssignments > 0 ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  This user still has {user.activeAssignments} active service
                  assignment{user.activeAssignments === 1 ? "" : "s"}. Unassign
                  them first — the record keeps its technician until then.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={submitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={submitting || (user?.activeAssignments ?? 0) > 0}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
          >
            {submitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              <>
                <Trash2Icon className="size-4" aria-hidden />
                Delete user
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UserSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="hidden h-48 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800 md:block" />
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800"
          />
        ))}
      </div>
    </div>
  );
}
