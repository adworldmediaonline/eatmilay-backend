export type OrderItemEmailData = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ShippingAddressEmailData = {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OrderEmailData = {
  orderNumber: string;
  customerEmail: string;
  customerName: string | null;
  items: OrderItemEmailData[];
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  shippingAddress: ShippingAddressEmailData;
  paymentMethod: string;
  estimatedDelivery?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status?: string;
  createdAt?: Date;
};
