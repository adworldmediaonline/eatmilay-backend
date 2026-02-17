/**
 * Shiprocket order creation
 */

import { getShiprocketToken } from "./shiprocket-auth.js";
import type { ShiprocketCreateOrderPayload, ShiprocketOrderResponse } from "./types.js";

export type CreateOrderResult =
  | { success: true; data: ShiprocketOrderResponse }
  | { success: false; error: string };

export async function createShiprocketOrderApi(
  payload: ShiprocketCreateOrderPayload
): Promise<CreateOrderResult> {
  const token = await getShiprocketToken();
  const apiUrl = process.env.SHIPROCKET_API_URL ?? "https://apiv2.shiprocket.in/v1/external";

  const response = await fetch(`${apiUrl}/orders/create/adhoc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorData: { message?: string; errors?: Array<{ field?: string; message?: string }>; data?: { data?: Array<{ pickup_location?: string }> } };
    try {
      errorData = (await response.json()) as typeof errorData;
      const locations = errorData.data?.data?.map((loc) => loc.pickup_location).filter(Boolean) ?? [];
      if (locations.length > 0) {
        throw new Error(`${errorData.message ?? "Failed to create order"}. Available locations: ${(locations as string[]).join(", ")}`);
      }
      const errMsg =
        errorData.message ??
        (Array.isArray(errorData.errors)
          ? errorData.errors.map((e) => `${e.field ?? ""}: ${e.message ?? ""}`).join(", ")
          : "") ??
        `Failed to create order: ${response.status}`;
      throw new Error(errMsg);
    } catch (error) {
      if (error instanceof Error) return { success: false, error: error.message };
      throw error;
    }
  }

  const data = (await response.json()) as ShiprocketOrderResponse & { shipment_id?: number; order_id?: number; awb_code?: string | null; channel_order_id?: string; status?: string; status_code?: number };

  if (data.shipment_id ?? data.order_id) {
    return {
      success: true,
      data: {
        shipment_id: data.shipment_id ?? 0,
        awb_code: data.awb_code ?? null,
        order_id: data.order_id,
        channel_order_id: data.channel_order_id,
        status: data.status,
        status_code: data.status_code,
      },
    };
  }

  return { success: false, error: "Invalid response from Shiprocket" };
}
