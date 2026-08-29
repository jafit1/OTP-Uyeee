import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => (
  <html lang="id">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Dashboard terpusat untuk mengelola alur verifikasi provider." />
      <title>OTP Uyeee — Verification Console</title>
      <link href="/static/style.css" rel="stylesheet" />
    </head>
    <body>{children}</body>
  </html>
))
