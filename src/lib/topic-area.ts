export type TopicArea = 'factoring' | 'supply_chain' | 'leasing';

/** 业务领域标签：不改数据库分类，避免把“监管/争议/解读”与业务领域混为一谈。 */
export function getTopicArea(article: { title?: string | null; content?: string | null; source_name?: string | null }): TopicArea {
  const text = `${article.title || ''} ${article.content || ''}`;
  if (/(融资租赁|金融租赁|售后回租|租赁物|租赁资产|租赁业务|金租)/.test(text)) return 'leasing';
  if (/(供应链金融|供应链融资|供应链票据|产业链|核心企业|应收账款)/.test(text)) return 'supply_chain';
  return 'factoring';
}
