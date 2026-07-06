'use client';

import Header from '@/components/Header';

export default function ArchivePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            往期归档
          </h1>
          <p className="text-sm text-gray-600">
            周报与月刊归档，包含深度行业分析与编委会评审
          </p>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-5xl mb-4">📦</div>
          <p className="text-gray-600 mb-2">暂无归档报告</p>
          <p className="text-sm text-gray-500">
            周报和月刊将在数据采集运行一段时间后自动生成
          </p>
        </div>
      </main>
    </div>
  );
}
