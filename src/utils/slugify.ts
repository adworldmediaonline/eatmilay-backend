/**
 * Converts text to a URL-friendly slug (lowercase, hyphens, alphanumeric).
 * Used for products, categories, roles, and any entity requiring a slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
