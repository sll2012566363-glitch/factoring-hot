import assert from 'node:assert/strict';
import test from 'node:test';
import { getWechatSource, getWechatSources, isWechatArticleUrl } from '../src/lib/wechat-sources';

test('WeChat registry contains the four user-approved specialist accounts', () => {
  const names = new Set(getWechatSources().map(source => source.name));
  for (const name of ['保理法律研究', '保理和供应链法律前沿', '供应链金融', '供应链行业观察']) {
    assert.equal(names.has(name), true);
  }
  assert.equal(getWechatSource('wechat-factoring-law-research')?.priority, 'T1');
});

test('only direct HTTPS WeChat article URLs are importable', () => {
  assert.equal(isWechatArticleUrl('https://mp.weixin.qq.com/s/example'), true);
  assert.equal(isWechatArticleUrl('https://mp.weixin.qq.com/s?__biz=example'), true);
  assert.equal(isWechatArticleUrl('http://mp.weixin.qq.com/s/example'), false);
  assert.equal(isWechatArticleUrl('https://mp.weixin.qq.com/'), false);
  assert.equal(isWechatArticleUrl('https://example.com/s/article'), false);
});
