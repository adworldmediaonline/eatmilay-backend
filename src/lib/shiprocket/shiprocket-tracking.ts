/**
 * Shiprocket order tracking
 */

import { getShiprocketToken } from "./shiprocket-auth.js";
import type { ShiprocketTrackingResponse } from "./types.js";

export type TrackOrderParams = {
  awbCode?: string | null;
  shipmentId?: number;
  channelOrderId?: string;
  channelId?: string;
};

export async function trackShiprocketOrder(
  params: TrackOrderParams
): Promise<ShiprocketTrackingResponse> {
  const { awbCode, shipmentId, channelOrderId, channelId } = params;
  const token = await getShiprocketToken();
  const apiUrl = process.env.SHIPROCKET_API_URL ?? "https://apiv2.shiprocket.in/v1/external";

  let trackUrl: string;
  if (shipmentId) {
    trackUrl = `${apiUrl}/courier/track/shipment/${shipmentId}`;
  } else if (awbCode) {
    trackUrl = `${apiUrl}/courier/track/awb/${awbCode}`;
  } else if (channelOrderId) {
    const searchParams = new URLSearchParams({ order_id: channelOrderId });
    if (channelId) searchParams.append("channel_id", channelId);
    trackUrl = `${apiUrl}/courier/track?${searchParams.toString()}`;
  } else {
    throw new Error("Either shipmentId, awbCode, or channelOrderId is required for tracking");
  }

  const response = await fetch(trackUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Failed to track order" }));
    throw new Error((errorData as { message?: string }).message ?? `Failed to track order: ${response.status}`);
  }

  const data = (await response.json()) as ShiprocketTrackingResponse | ShiprocketTrackingResponse[];
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as ShiprocketTrackingResponse;
  }
  return data as ShiprocketTrackingResponse;
}
