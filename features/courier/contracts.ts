import type { ShipmentStatus } from "@/types/api";

export interface CourierDashboardStats {
  total: number;
  readyPickup: number;
  inRoute: number;
  delivered: number;
  byStatus: Record<ShipmentStatus, number>;
}
