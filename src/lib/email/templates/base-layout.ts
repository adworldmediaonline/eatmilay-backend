export function baseLayout(params: { title: string; body: string }): string {
  const { title, body } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 16px; margin-bottom: 24px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { font-weight: 600; background: #f9fafb; }
    .text-right { text-align: right; }
    .text-muted { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <strong>Eat Milay</strong>
    </div>
    ${body}
    <div class="footer">
      Questions? Contact us at customercare@eatmilay.com
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
