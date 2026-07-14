'use client';

import { useState } from 'react';
import { Category } from '@/types';

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export default function CategoryFilter({ categories, selectedCategory, onSelectCategory }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        onClick={() => onSelectCategory(null)}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          selectedCategory === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        全部
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelectCategory(category.id)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === category.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <span className="mr-1">{category.icon}</span>
          {category.name}
        </button>
      ))}
    </div>
  );
}
