import { ApiClient, ApiError } from "@/lib/client/api";
import type { CurrentUser } from "@/types/api";

export { roleHome, permittedPath, safeReturnUrl } from "@/lib/auth/route-access";
export type SessionSnapshot = {
  status: "loading" | "authenticated" | "anonymous" | "error";
  user: CurrentUser | null;
  error: unknown;
  revision: number;
};
export const initialSession: SessionSnapshot = {
  status: "loading",
  user: null,
  error: null,
  revision: 0,
};

export class SessionStore {
  snapshot = initialSession;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private epoch = 0;
  private authBusy = false;
  readonly api: ApiClient;
  constructor(api = new ApiClient()) {
    this.api = api;
    api.onExpired = () => this.clear();
    api.onRefresh = () => this.refreshSession();
    api.onForbidden = () => this.revalidate();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(
    next: Omit<SessionSnapshot, "revision">,
    newIdentity = false,
  ) {
    this.snapshot = {
      ...next,
      revision: this.snapshot.revision + (newIdentity ? 1 : 0),
    };
    this.listeners.forEach((listener) => listener());
  }
  clear(error: unknown = null) {
    this.epoch++;
    this.api.clear();
    this.publish(
      { status: error ? "error" : "anonymous", user: null, error },
      true,
    );
  }
  private accept(user: CurrentUser) {
    if (!user.isActive || !["CUSTOMER", "COURIER", "ADMIN"].includes(user.role))
      throw new ApiError(401, "Please sign in again");
    const changed =
      !!this.snapshot.user &&
      (user.id !== this.snapshot.user.id ||
        user.role !== this.snapshot.user.role);
    if (changed) {
      const token = this.api.token;
      this.api.clear();
      this.api.token = token;
    }
    this.publish({ status: "authenticated", user, error: null }, changed);
  }
  async refreshSession() {
    const epoch = this.epoch;
    const data = await this.api.raw<{ accessToken: string }>(
      "/auth/refresh-token",
      { method: "POST" },
    );
    if (epoch !== this.epoch)
      throw new DOMException("Session changed", "AbortError");
    this.api.token = data.accessToken;
    const { user } = await this.api.raw<{ user: CurrentUser }>(
      "/users/me",
      {},
      data.accessToken,
    );
    if (epoch !== this.epoch)
      throw new DOMException("Session changed", "AbortError");
    this.accept(user);
  }
  restore() {
    if (this.pending) return this.pending;
    if (this.authBusy) return Promise.resolve();
    this.publish({ status: "loading", user: null, error: null });
    this.pending = this.api
      .refresh()
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) this.clear();
        else this.clear(error);
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  revalidate() {
    if (this.pending) return this.pending;
    if (!this.api.token || this.authBusy) return Promise.resolve();
    const epoch = this.epoch;
    this.pending = this.api
      .request<{ user: CurrentUser }>("/users/me")
      .then(({ user }) => {
        if (epoch === this.epoch) this.accept(user);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        this.clear(
          error instanceof ApiError && error.status === 401 ? null : error,
        );
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  async authenticate(kind: "login" | "register", body: unknown) {
    if (this.authBusy)
      throw new ApiError(409, "Another account request is in progress");
    this.authBusy = true;
    try {
      await this.pending;
      await this.api.settleRefresh();
      this.clear();
      const epoch = this.epoch;
      const data = await this.api.raw<{ accessToken: string }>(
        `/auth/${kind}`,
        { method: "POST", body },
      );
      if (epoch !== this.epoch)
        throw new DOMException("Session changed", "AbortError");
      this.api.token = data.accessToken;
      const { user } = await this.api.raw<{ user: CurrentUser }>(
        "/users/me",
        {},
        data.accessToken,
      );
      if (epoch !== this.epoch)
        throw new DOMException("Session changed", "AbortError");
      this.accept(user);
      return user;
    } catch (error) {
      this.clear();
      throw error;
    } finally {
      this.authBusy = false;
    }
  }
  async logout() {
    if (this.authBusy)
      throw new ApiError(409, "Another account request is in progress");
    this.authBusy = true;
    // Invalidate immediately, then wait out any cookie rotation before revocation.
    this.clear();
    let failure: unknown = null;
    try {
      await this.pending;
      await this.api.settleRefresh();
      await this.api.raw("/auth/logout", { method: "POST" });
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      this.clear();
      this.authBusy = false;
      if (failure)
        this.publish({
          status: "anonymous",
          user: null,
          error: new ApiError(
            409,
            "Sign-out was not confirmed",
            [{ code: "LOGOUT_FAILED" }],
            failure instanceof ApiError ? failure.retryAt : 0,
          ),
        });
    }
  }
  async updateProfile(body: {
    avatar?: string | null;
    name: string;
    email: string;
    phone: string | null;
  }) {
    const { user } = await this.api.request<{ user: CurrentUser }>(
      "/users/me",
      { method: "PATCH", body },
    );
    this.accept(user);
    return user;
  }
}
