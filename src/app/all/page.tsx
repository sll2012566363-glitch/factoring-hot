'use client';

import Header from '@/components/Header';
import CategoryFilter from '@/components/CategoryFilter';
import { useState } from 'react';
import type { Category } from '@/types';

const sections: Category[] = [
  { id: 'frontier',       name: '前沿解读',     icon: '🔍', description: '评分最高的深度分析文章' },
  { id: 'industry_model', name: '行业前沿模式', icon: '🏭', description: '市场趋势与创新实践' },
  { id: 'regulatory',     name: '前沿监管新闻', icon: '📋', description: '央行、金融监管总局等政策动态' },
  { id: 'dispute',        name: '前沿争议解决', icon: '⚖️', description: '风险预警与争议解决案例' },
  { id: 'normative',      name: '前沿规范文件', icon: '📄', description: '高分监管规范与政策文件' },
];

export default function AllArticles() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            全部文章
          </h1>
          <p className="text-sm text-gray-600">
            查看所有采集到的保理与供应链金融相关资讯
          </p>
        </div>
        
        <CategoryFilter
          categories={sections}
          selectedCategory={selectedSection}
          onSelectCategory={setSelectedSection}
        />
        
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-5xl mb-4">📚</div>
          <p className="text-gray-600 mb-2">正在接入数据源...</p>
          <p className="text-sm text-gray-500">
            首次运行需要完成数据库配置和数据采集
          </p>
        </div>
      </main>
    </div>
  );
}
