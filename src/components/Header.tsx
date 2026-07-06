'use client';

import Link from 'next/link';

interface HeaderProps {
  title?: string;
  showNav?: boolean;
}

export default function Header({ title = '保理热榜', showNav = true }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                保
              </div>
              <span className="text-lg font-bold text-gray-900">
                {title}
              </span>
            </Link>
            
            {showNav && (
              <nav className="hidden md:flex items-center gap-1">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  热榜
                </Link>
                <Link
                  href="/all"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  全部
                </Link>
                <Link
                  href="/report"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  日报
                </Link>
                <Link
                  href="/topics"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  热门话题
                </Link>
                <Link
                  href="/report/weekly"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  周报
                </Link>
                <Link
                  href="/report/monthly"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  月刊
                </Link>
                <Link
                  href="/archive"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  往期
                </Link>
              </nav>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              保理与供应链金融资讯聚合
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
