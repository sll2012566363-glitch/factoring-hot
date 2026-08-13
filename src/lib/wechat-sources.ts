import registry from '../../config/wechat-sources.json';

export interface WechatSource {
  id: string;
  name: string;
  priority: string;
  weight: number;
  category: string;
  owned: boolean;
  note: string;
}

const sources = registry.sources as WechatSource[];

export function getWechatSources(): WechatSource[] {
  return sources;
}

export function getWechatSource(id: string): WechatSource | null {
  return sources.find(source => source.id === id) || null;
}

export function isWechatArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'mp.weixin.qq.com'
      && /^\/s(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}
