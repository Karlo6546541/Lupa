// Maps links inside article HTML to app screens. Subscribe/account links NEVER open the website's Stripe checkout
// inside the store apps (App Store 3.1.1 / Play payments policy) — they go to the in-app subscription screen.
import * as WebBrowser from 'expo-web-browser';
import type { useRouter } from 'expo-router';
type Router = ReturnType<typeof useRouter>;
import { SITE_URL } from './config';
import type { Feed } from './feed';

export type AppRoute =
  | { kind: 'article'; id: string } | { kind: 'category'; id: string } | { kind: 'page'; key: 'about' | 'disclaimer' }
  | { kind: 'subscription' } | { kind: 'home' } | { kind: 'company'; ticker: string } | { kind: 'watch' } | { kind: 'external'; url: string };

export function routeForUrl(raw: string, feed: Feed): AppRoute | null {
  if (raw.startsWith('lupa://')) {
    const [kind, id] = raw.slice('lupa://'.length).split('/');
    if (kind === 'category' && id) return { kind: 'category', id };
    if (kind === 'page' && (id === 'about' || id === 'disclaimer')) return { kind: 'page', key: id };
    if (kind === 'subscription') return { kind: 'subscription' };
    return null; // subscribe / restore / retry are handled by the screen
  }
  let u: URL;
  try { u = new URL(raw, SITE_URL + '/'); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return { kind: 'external', url: raw };
  if (u.origin !== new URL(SITE_URL).origin) return { kind: 'external', url: u.toString() };
  const parts = u.pathname.split('/').filter(Boolean); // [lang, section, slug]
  const [lang, section, slug] = parts;
  if (lang !== 'hr' && lang !== 'en') return { kind: 'home' };
  if ((section === 'clanci' || section === 'articles') && slug) {
    const p = feed.posts.find((x) => x.url[lang] === `/${lang}/${section}/${slug}/`);
    return p ? { kind: 'article', id: p.id } : { kind: 'external', url: u.toString() };
  }
  if ((section === 'rubrika' || section === 'category') && slug) {
    const c = feed.categories.find((x) => x[lang].slug === slug);
    return c ? { kind: 'category', id: c.id } : { kind: 'home' };
  }
  if (section === 'tvrtke' || section === 'companies') {
    const tk = (slug || '').toUpperCase();
    return tk && feed.tracker?.companies[tk] ? { kind: 'company', ticker: tk } : { kind: 'watch' };
  }
  if (['kalendar', 'calendar', 'rezultati', 'track-record'].includes(section)) return { kind: 'watch' };
  if (section === 'o-nama' || section === 'about') return { kind: 'page', key: 'about' };
  if (section === 'izjava-o-odgovornosti' || section === 'disclaimer') return { kind: 'page', key: 'disclaimer' };
  if (['pretplata', 'subscribe', 'racun', 'account', 'podrzi-lupu', 'support'].includes(section)) return { kind: 'subscription' };
  if (!section || section === 'arhiva' || section === 'archive') return { kind: 'home' };
  return { kind: 'external', url: u.toString() }; // newsletter, advertising — informational pages on the website
}

export function openRoute(r: AppRoute, router: Router) {
  switch (r.kind) {
    case 'article': router.push({ pathname: '/article/[id]', params: { id: r.id } }); break;
    case 'category': router.push({ pathname: '/category/[id]', params: { id: r.id } }); break;
    case 'page': router.push({ pathname: '/page/[key]', params: { key: r.key } }); break;
    case 'subscription': router.navigate('/subscription'); break;
    case 'home': router.navigate('/'); break;
    case 'company': router.push({ pathname: '/company/[ticker]', params: { ticker: r.ticker } }); break;
    case 'watch': router.navigate('/watch'); break;
    case 'external': WebBrowser.openBrowserAsync(r.url).catch(() => {}); break;
  }
}
