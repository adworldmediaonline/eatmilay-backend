export { transporter } from "./transporter.js";
export { sendEmail } from "./send-email.js";
export type { SendEmailParams } from "./send-email.js";
export type { OrderEmailData, OrderItemEmailData, ShippingAddressEmailData } from "./types.js";
export {
  sendOrderConfirmationEmail,
  type OrderDoc,
} from "./send-order-confirmation.js";
export { renderOrderConfirmation } from "./templates/order-confirmation.js";
export { renderOrderShipped } from "./templates/order-shipped.js";
export { renderOrderDelivered } from "./templates/order-delivered.js";
export {
  renderOrderStatusUpdate,
  type OrderStatusUpdateData,
} from "./templates/order-status-update.js";
