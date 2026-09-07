import { request } from "./client";
import type { OperationSettings } from "../types";

export const settingsApi = {
  get: () => request<OperationSettings>("/settings/"),

  update: (data: Partial<OperationSettings>) =>
    request<OperationSettings>("/settings/", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
