import type { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.js";
import { requireSession, requireSuperAdmin, requireAdmin } from "../middleware/require-session.js";
import { reviewSubmitLimiter } from "../middleware/review-rate-limit.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import * as rolesHandlers from "./roles.js";
import * as userRolesHandlers from "./user-roles.js";
import * as productCategoriesHandlers from "./product-categories.js";
import * as productCollectionsHandlers from "./product-collections.js";
import * as ordersHandlers from "./orders.js";
import * as ordersExportHandlers from "./orders-export.js";
import * as discountsHandlers from "./discounts.js";
import * as productsHandlers from "./products.js";
import * as uploadHandlers from "./upload.js";
import * as storeProductsHandlers from "./store-products.js";
import * as storeProductCategoriesHandlers from "./store-product-categories.js";
import * as storeProductCollectionsHandlers from "./store-product-collections.js";
import * as storeOrdersHandlers from "./store-orders.js";
import * as storeUserOrdersHandlers from "./store-user-orders.js";
import * as storeDiscountsHandlers from "./store-discounts.js";
import * as storeShippingHandlers from "./store-shipping.js";
import * as storePaymentsHandlers from "./store-payments.js";
import * as storeShiprocketHandlers from "./store-shiprocket.js";
import * as storeSettingsHandlers from "./store-settings.js";
import * as storeCartHandlers from "./store-cart.js";
import * as storeReviewsHandlers from "./store-reviews.js";
import * as reviewsHandlers from "./reviews.js";
import * as adminSettingsHandlers from "./admin-settings.js";

export function registerRoutes(app: import("express").Application): void {
  app.get("/api/me", async (req: Request, res: Response) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(session);
  });

  app.use("/api/admin/roles", requireSession, requireSuperAdmin);
  app.get("/api/admin/roles", (req, res) =>
    rolesHandlers.listRoles(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/roles", (req, res) =>
    rolesHandlers.createRole(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/roles/:id", (req, res) =>
    rolesHandlers.getRole(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/roles/:id", (req, res) =>
    rolesHandlers.updateRole(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/roles/:id", (req, res) =>
    rolesHandlers.deleteRole(req as AuthenticatedRequest, res)
  );

  app.post(
    "/api/admin/users/:id/assign-role",
    requireSession,
    requireSuperAdmin,
    (req, res) =>
      userRolesHandlers.assignRoleToUser(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/product-categories", requireSession, requireAdmin);
  app.get("/api/admin/product-categories", (req, res) =>
    productCategoriesHandlers.listProductCategories(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/product-categories", (req, res) =>
    productCategoriesHandlers.createProductCategory(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/product-categories/:id", (req, res) =>
    productCategoriesHandlers.getProductCategory(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/product-categories/:id", (req, res) =>
    productCategoriesHandlers.updateProductCategory(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/product-categories/:id", (req, res) =>
    productCategoriesHandlers.deleteProductCategory(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/product-collections", requireSession, requireAdmin);
  app.get("/api/admin/product-collections", (req, res) =>
    productCollectionsHandlers.listProductCollections(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/product-collections", (req, res) =>
    productCollectionsHandlers.createProductCollection(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/product-collections/:id", (req, res) =>
    productCollectionsHandlers.getProductCollection(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/product-collections/:id", (req, res) =>
    productCollectionsHandlers.updateProductCollection(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/product-collections/:id", (req, res) =>
    productCollectionsHandlers.deleteProductCollection(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/orders", requireSession, requireAdmin);
  app.get("/api/admin/orders", (req, res) =>
    ordersHandlers.listOrders(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/orders/export", (req, res) =>
    ordersExportHandlers.exportOrders(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/orders", (req, res) =>
    ordersHandlers.createOrder(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/orders/:id", (req, res) =>
    ordersHandlers.getOrder(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/orders/:id", (req, res) =>
    ordersHandlers.updateOrder(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/orders/:id/shiprocket/create", (req, res) =>
    storeShiprocketHandlers.createShiprocketOrderForAdmin(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/orders/:id/shiprocket/track", (req, res) =>
    storeShiprocketHandlers.trackShiprocketOrderForAdmin(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/discounts", requireSession, requireAdmin);
  app.get("/api/admin/discounts", (req, res) =>
    discountsHandlers.listDiscounts(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/discounts", (req, res) =>
    discountsHandlers.createDiscount(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/discounts/:id", (req, res) =>
    discountsHandlers.getDiscount(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/discounts/:id", (req, res) =>
    discountsHandlers.updateDiscount(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/discounts/:id", (req, res) =>
    discountsHandlers.deleteDiscount(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/reviews", requireSession, requireAdmin);
  app.get("/api/admin/reviews", (req, res) =>
    reviewsHandlers.listReviews(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/reviews/:id", (req, res) =>
    reviewsHandlers.updateReview(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/reviews/:id", (req, res) =>
    reviewsHandlers.deleteReview(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/products", requireSession, requireAdmin);
  app.get("/api/admin/products", (req, res) =>
    productsHandlers.listProducts(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/products/slug-available", (req, res) =>
    productsHandlers.checkSlugAvailability(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/products/import", (req, res) =>
    productsHandlers.importProducts(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/products", (req, res) =>
    productsHandlers.createProduct(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/products/:id", (req, res) =>
    productsHandlers.getProduct(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/products/:id", (req, res) =>
    productsHandlers.updateProduct(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/products/:id/duplicate", (req, res) =>
    productsHandlers.duplicateProduct(req as AuthenticatedRequest, res)
  );
  app.delete("/api/admin/products/:id", (req, res) =>
    productsHandlers.deleteProduct(req as AuthenticatedRequest, res)
  );

  app.get("/api/admin/upload/signature", requireSession, requireAdmin, (req, res) =>
    uploadHandlers.getUploadSignature(req as AuthenticatedRequest, res)
  );
  app.post("/api/admin/upload/delete", requireSession, requireAdmin, (req, res) =>
    uploadHandlers.deleteImage(req as AuthenticatedRequest, res)
  );

  // Public store API (no auth)
  app.get("/api/store/products", (req, res) =>
    storeProductsHandlers.listStoreProducts(req, res)
  );
  app.get("/api/store/products/facets", (req, res) =>
    storeProductsHandlers.getStoreProductFacets(req, res)
  );
  app.get("/api/store/products/slug/:slug", (req, res) =>
    storeProductsHandlers.getStoreProductBySlug(req, res)
  );
  app.get("/api/store/product-categories", (req, res) =>
    storeProductCategoriesHandlers.listStoreProductCategories(req, res)
  );
  app.get("/api/store/product-categories/slug/:slug", (req, res) =>
    storeProductCategoriesHandlers.getStoreProductCategoryBySlug(req, res)
  );
  app.get("/api/store/product-collections", (req, res) =>
    storeProductCollectionsHandlers.listStoreProductCollections(req, res)
  );
  app.get("/api/store/product-collections/slug/:slug", (req, res) =>
    storeProductCollectionsHandlers.getStoreProductCollectionBySlug(req, res)
  );
  app.get("/api/store/orders/track", (req, res) =>
    storeOrdersHandlers.getOrderTracking(req, res)
  );
  app.post("/api/store/orders", (req, res) =>
    storeOrdersHandlers.createStoreOrder(req, res)
  );
  app.get("/api/store/user/orders", requireSession, (req, res) =>
    storeUserOrdersHandlers.listUserOrders(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/user/orders/by-number/:orderNumber", requireSession, (req, res) =>
    storeUserOrdersHandlers.getUserOrderByNumber(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/shipping/rates", (req, res) =>
    storeShippingHandlers.getShippingRates(req, res)
  );
  app.post("/api/store/payments/verify", (req, res) =>
    storePaymentsHandlers.verifyPayment(req, res)
  );
  app.post("/api/store/discounts/validate", (req, res) =>
    storeDiscountsHandlers.validateStoreDiscount(req, res)
  );
  app.post("/api/store/discounts/available", (req, res) =>
    storeDiscountsHandlers.getAvailableOffers(req, res)
  );
  app.get("/api/store/discounts/featured", (req, res) =>
    storeDiscountsHandlers.getFeaturedOffer(req, res)
  );
  app.post("/api/store/discounts/for-products", (req, res) =>
    storeDiscountsHandlers.getDiscountsForProducts(req, res)
  );
  app.get("/api/store/settings/coupon", (req, res) =>
    storeSettingsHandlers.getCouponSettings(req, res)
  );
  app.get("/api/store/settings/shipping", (req, res) =>
    storeSettingsHandlers.getShippingSettings(req, res)
  );
  app.put("/api/store/cart", requireSession, (req, res) =>
    storeCartHandlers.putCart(req as AuthenticatedRequest, res)
  );
  app.patch("/api/store/cart/reminder-email", requireSession, (req, res) =>
    storeCartHandlers.patchReminderEmail(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/reviews/product/:productId", (req, res) =>
    storeReviewsHandlers.listProductReviews(req, res)
  );
  app.post("/api/store/reviews/product", requireSession, reviewSubmitLimiter, (req, res) =>
    storeReviewsHandlers.submitProductReview(req as AuthenticatedRequest, res)
  );
  app.post("/api/store/reviews/order", requireSession, reviewSubmitLimiter, (req, res) =>
    storeReviewsHandlers.submitOrderReview(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/reviews/order/:orderId", requireSession, (req, res) =>
    storeReviewsHandlers.getOrderReview(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/reviews/can-review-product/:productId", requireSession, (req, res) =>
    storeReviewsHandlers.canReviewProduct(req as AuthenticatedRequest, res)
  );
  app.get("/api/store/reviews/can-review-order/:orderNumber", requireSession, (req, res) =>
    storeReviewsHandlers.canReviewOrder(req as AuthenticatedRequest, res)
  );

  app.use("/api/admin/settings", requireSession, requireAdmin);
  app.get("/api/admin/settings/coupon", (req, res) =>
    adminSettingsHandlers.getAdminCouponSettings(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/settings/coupon", (req, res) =>
    adminSettingsHandlers.updateAdminCouponSettings(req as AuthenticatedRequest, res)
  );
  app.get("/api/admin/settings/shipping", (req, res) =>
    adminSettingsHandlers.getAdminShippingSettings(req as AuthenticatedRequest, res)
  );
  app.patch("/api/admin/settings/shipping", (req, res) =>
    adminSettingsHandlers.updateAdminShippingSettings(req as AuthenticatedRequest, res)
  );
}
