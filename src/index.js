/**
 * apps.ninochavez.co router.
 *
 * Each app keeps its own Pages project as the single source of its page. This
 * Worker maps a path prefix onto that project and rewrites root-absolute links
 * in the HTML so the app's own assets resolve under the prefix.
 *
 * The alternative was copying each app's build into one project, which works
 * until an app redeploys and its copy silently goes stale — on a download page
 * that means a wrong version number and a wrong checksum.
 *
 * Adding an app is one line in ROUTES.
 */

const ROUTES = {
  '/cutting-board': 'https://private-beta-kit.film-room-portal.pages.dev',
  '/yawn': 'https://yawn-site.pages.dev',
};

const INDEX = 'https://apps-ninochavez-git.pages.dev';

/** Prefixes a root-absolute URL, leaving protocol-relative, external, anchor, and data URLs alone. */
function prefixAttr(value, prefix) {
  if (!value) return value;
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  if (value.startsWith(prefix + '/') || value === prefix) return value;
  return prefix + value;
}

class AttrRewriter {
  constructor(attr, prefix) {
    this.attr = attr;
    this.prefix = prefix;
  }
  element(el) {
    const v = el.getAttribute(this.attr);
    const next = prefixAttr(v, this.prefix);
    if (next !== v) el.setAttribute(this.attr, next);
  }
}

/** srcset carries several comma-separated candidates, each "url descriptor". */
class SrcSetRewriter {
  constructor(prefix) { this.prefix = prefix; }
  element(el) {
    const v = el.getAttribute('srcset');
    if (!v) return;
    const next = v.split(',').map(part => {
      const seg = part.trim().split(/\s+/);
      seg[0] = prefixAttr(seg[0], this.prefix);
      return seg.join(' ');
    }).join(', ');
    if (next !== v) el.setAttribute('srcset', next);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    for (const [prefix, origin] of Object.entries(ROUTES)) {
      const onRoute = url.pathname === prefix || url.pathname.startsWith(prefix + '/');
      if (!onRoute) continue;

      // Keep the trailing slash so relative links inside the app page behave.
      if (url.pathname === prefix) {
        return Response.redirect(url.origin + prefix + '/', 301);
      }

      const rest = url.pathname.slice(prefix.length) || '/';
      const upstream = new URL(rest + url.search, origin);
      const res = await fetch(upstream, {
        method: request.method,
        headers: request.headers,
        redirect: 'manual',
      });

      const type = res.headers.get('content-type') || '';
      if (!type.includes('text/html')) return res;

      const out = new Response(res.body, res);
      return new HTMLRewriter()
        .on('a', new AttrRewriter('href', prefix))
        .on('link', new AttrRewriter('href', prefix))
        .on('area', new AttrRewriter('href', prefix))
        .on('form', new AttrRewriter('action', prefix))
        .on('img', new AttrRewriter('src', prefix))
        .on('script', new AttrRewriter('src', prefix))
        .on('source', new AttrRewriter('src', prefix))
        .on('video', new AttrRewriter('poster', prefix))
        .on('img', new SrcSetRewriter(prefix))
        .on('source', new SrcSetRewriter(prefix))
        .transform(out);
    }

    // Everything else is the apps index.
    return fetch(new URL(url.pathname + url.search, INDEX), request);
  },
};
