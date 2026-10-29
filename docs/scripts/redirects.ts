// GitHub Pages has no server-side redirects, so a moved URL is served as a static
// stub: meta refresh for crawlers, location.replace for browsers, canonical so
// Google consolidates the old URL onto the new one.

const SITE = 'https://www.realtime-bpm-analyzer.com';

export function redirectHtml(target: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<link rel="canonical" href="${SITE}${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved. <a href="${target}">Continue to the new page</a>.</p>
</body>
</html>
`;
}

// The built files GitHub Pages would answer a clean-URL target with, in its lookup order.
export function targetFiles(target: string): string[] {
  const path = target.replace(/^\//, '');
  if (path === '' || path.endsWith('/')) return [`${path}index.html`];
  return [`${path}.html`, `${path}/index.html`];
}

// Problems with the map itself or against the built site; empty when every entry
// lands on a real page in one hop. `isBuiltPage` must answer for files VitePress
// emitted, not for redirect stubs.
export function checkRedirects(
  redirects: Readonly<Record<string, string>>,
  isBuiltPage: (file: string) => boolean,
): string[] {
  const errors: string[] = [];
  for (const [from, to] of Object.entries(redirects)) {
    if (from.startsWith('/') || !from.endsWith('.html')) {
      errors.push(`${from}: source must be a relative .html file`);
    }
    if (!/^\/[\w./-]*$/.test(to)) {
      errors.push(`${from}: target ${to} must be a plain absolute path`);
      continue;
    }
    if (isBuiltPage(from)) {
      errors.push(`${from}: would overwrite a page the site still builds`);
    }
    const files = targetFiles(to);
    if (files.some((file) => file in redirects)) {
      errors.push(`${from}: target ${to} is itself a redirect`);
    } else if (!files.some(isBuiltPage)) {
      errors.push(`${from}: target ${to} is not a built page`);
    }
  }
  return errors;
}
