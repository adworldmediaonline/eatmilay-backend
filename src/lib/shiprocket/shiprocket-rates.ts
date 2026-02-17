/**
 * Shiprocket serviceability / shipping rates
 */

import { getShiprocketToken } from "./shiprocket-auth.js";
import type { ShiprocketServiceabilityResponse } from "./types.js";

export type ServiceabilityParams = {
  pickup_postcode: string;
  delivery_postcode: string;
  cod?: boolean;
  weight?: string;
  length?: number;
  breadth?: number;
  height?: number;
  declared_value?: number;
  mode?: "Surface" | "Air";
};

export async function checkServiceability(
  params: ServiceabilityParams
): Promise<ShiprocketServiceabilityResponse> {
  const token = await getShiprocketToken();
  const apiUrl = process.env.SHIPROCKET_API_URL ?? "https://apiv2.shiprocket.in/v1/external";

  const queryParams = new URLSearchParams({
    pickup_postcode: params.pickup_postcode,
    delivery_postcode: params.delivery_postcode,
  });

  if (params.cod !== undefined) {
    queryParams.append("cod", params.cod ? "1" : "0");
  }
  if (params.weight) queryParams.append("weight", params.weight);
  if (params.length != null) queryParams.append("length", String(params.length));
  if (params.breadth != null) queryParams.append("breadth", String(params.breadth));
  if (params.height != null) queryParams.append("height", String(params.height));
  if (params.declared_value != null) queryParams.append("declared_value", String(params.declared_value));
  if (params.mode) queryParams.append("mode", params.mode);

  const url = `${apiUrl}/courier/serviceability/?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Failed to check serviceability" }));
    throw new Error((errorData as { message?: string }).message ?? `Failed to check serviceability: ${response.status}`);
  }

  return response.json() as Promise<ShiprocketServiceabilityResponse>;
}
