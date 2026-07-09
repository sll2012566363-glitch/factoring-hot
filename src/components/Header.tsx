'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface HeaderProps {
  title?: string;
  showNav?: boolean;
}

const MORE_LINKS = [
  { href: '/agent', label: 'Agent 接入' },
  { href: '/about', label: '关于' },
  { href: '/changelog', label: '更新日志' },
  { href: '/feedback', label: '反馈' },
];

export default function Header({ title = '保理热榜', showNav = true }: HeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setMoreOpen(v => !v)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                  >
                    更多
                    <svg
                      className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {moreOpen && (
                    <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                      {MORE_LINKS.map(link => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMoreOpen(false)}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
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
