// node --test "site/tests/*.test.*"
import test from 'node:test';
import assert from 'node:assert/strict';
import { planMessages, topicTicker } from '../scripts/send_push.mjs';

const ev = (id, date, important = true) => ({ id, date, important, kind: 'buy', text: { hr: 'Kupnja uprave ' + id, en: 'Insider buy ' + id } });
const co = (events) => ({ name: 'Infleqtion, Inc.', url: { hr: '/hr/tvrtke/infq/', en: '/en/companies/infq/' }, events });
const post = (id) => ({ id, title: { hr: 'Naslov ' + id, en: 'Title ' + id }, url: { hr: `/hr/clanci/${id}/`, en: `/en/articles/${id}/` } });
const feed = (posts, events, calendar = []) => ({ posts, tracker: { companies: { INFQ: co(events) }, calendar } });

test('no baseline → nothing is sent', () => {
  assert.deepEqual(planMessages(null, feed([post('a')], [ev('1', '2026-11-10')]), '2026-11-11'), []);
});

test('new post → news topics in both languages', () => {
  const m = planMessages(feed([post('a')], []), feed([post('a'), post('b')], []), '2026-11-11');
  assert.deepEqual(m.map((x) => x.topic), ['news_hr', 'news_en']);
  assert.equal(m[0].url, '/hr/clanci/b/');
});

test('only new, important, recent events go to the ticker topic', () => {
  const oldF = feed([], [ev('1', '2026-11-09')]);
  const newF = feed([], [ev('1', '2026-11-09'), ev('2', '2026-11-10'), ev('3', '2026-11-10', false), ev('4', '2026-09-01')]);
  const m = planMessages(oldF, newF, '2026-11-11');
  assert.deepEqual(m.map((x) => x.topic), ['t_INFQ_hr', 't_INFQ_en']);
  assert.match(m[0].body, /Kupnja uprave 2/);
  assert.equal(m[1].url, '/en/companies/infq/');
});

test('old feed without tracker (app feed from before the tracker) → no event flood', () => {
  const m = planMessages({ posts: [] }, feed([], [ev('1', '2026-11-10')]), '2026-11-11');
  assert.deepEqual(m, []);
});

test('calendar: confirmed events dated tomorrow only', () => {
  const cal = [
    { date: '2026-11-12', ticker: 'INFQ', estimate: false, title: { hr: 'Rezultati', en: 'Results' } },
    { date: '2026-11-12', ticker: 'INFQ', estimate: true, title: { hr: 'Procjena', en: 'Estimate' } },
    { date: '2026-11-13', ticker: 'INFQ', estimate: false, title: { hr: 'Kasnije', en: 'Later' } },
  ];
  const m = planMessages(feed([], []), feed([], [], cal), '2026-11-11');
  assert.equal(m.length, 2);
  assert.equal(m[0].title, 'INFQ: sutra');
});

test('topic names are valid for FCM', () => {
  assert.equal(topicTicker('BRK.B', 'hr'), 't_BRK.B_hr');
  assert.equal(topicTicker('^RUT', 'en'), 't_-RUT_en');
});
