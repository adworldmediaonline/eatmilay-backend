/**
 * Shiprocket API Types
 */

export type ShiprocketOrderItem = {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string;
};

export type ShiprocketCreateOrderPayload = {
  order_id: string;
  order_date: string;
  pickup_location: string;
  comment?: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_address_2?: string;
  billing_isd_code?: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: ShiprocketOrderItem[];
  payment_method: string;
  shipping_charges?: number;
  total_discount?: number;
  sub_total: number;
  length?: number;
  breadth?: number;
  height?: number;
  weight?: number;
};

export type ShiprocketOrderResponse = {
  order_id?: number;
  channel_order_id?: string;
  shipment_id: number;
  awb_code: string | null;
  status?: string;
  status_code?: number;
};

export type ShiprocketTrackingResponse = {
  tracking_data: {
    shipment_status: number;
    shipment_track: Array<{
      current_status: string;
      current_status_code: string;
      current_timestamp: string;
      awb_code: string;
      courier_name: string;
      etd: string;
    }>;
    shipment_track_activities: Array<{
      date: string;
      status: string;
      activity: string;
      location: string;
    }>;
  };
};

export type ShiprocketCourierCompany = {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  estimated_delivery_days: number;
  etd: string;
  company_name: string;
};

export type ShiprocketServiceabilityResponse = {
  status: number;
  data: {
    available_courier_companies: ShiprocketCourierCompany[];
    recommended_courier_company_id: number;
  };
};
