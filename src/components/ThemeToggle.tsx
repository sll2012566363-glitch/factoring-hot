'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'system' | 'dark';

/** 应用主题到 <html>：dark class 开关；system 跟随 prefers-color-scheme */
function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

/** 三态主题切换（浅色 / 跟随系统 / 深色），对齐 AIHOT 侧栏样式 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem('theme') as Theme) || 'system';
    setTheme(saved);
    // 系统偏好变化时，system 模式实时跟随
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (((localStorage.getItem('theme') as Theme) || 'system') === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const select = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
  };

  // SSR 阶段渲染占位，避免 hydration 闪烁
  if (!mounted) return <div className="w-[88px] h-7" aria-hidden />;

  const btn = (t: Theme, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => select(t)}
      title={label}
      aria-label={label}
      className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
        theme === t
          ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
      {btn('light', '浅色', (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ))}
      {btn('system', '跟随系统', (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ))}
      {btn('dark', '深色', (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ))}
    </div>
  );
}
