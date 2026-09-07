import { request } from "./client";
import type { AssignmentResult } from "../types";

export const assignmentsApi = {
  assignOrder: (orderId: number, driverId?: number) =>
    request<AssignmentResult>(
      `/assignments/order/${orderId}${driverId ? `?driver_id=${driverId}` : ""}`,
      { method: "POST" }
    ),

  autoAssignAll: () =>
    request<{
      total_processed: number;
      total_assigned: number;
      assignments: AssignmentResult[];
      unassigned_order_ids: number[];
    }>("/assignments/auto-assign-all", { method: "POST" }),
};
