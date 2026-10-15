
import React from 'react';

export const CATEGORIES = [
  'Development',
  'Marketing',
  'Design',
  'Administrative',
  'Research',
  'Meeting',
  'Maintenance'
];

export const TASK_COLORS = [
  { name: 'Blue', bg: 'bg-zinc-200 dark:bg-zinc-800', text: 'text-zinc-900 dark:text-zinc-200', border: 'border-zinc-300 dark:border-zinc-700', hex: '#3b82f6' },
  { name: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hex: '#10b981' },
  { name: 'Amber', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', hex: '#f59e0b' },
  { name: 'Rose', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', hex: '#f43f5e' },
  { name: 'Indigo', bg: 'bg-zinc-200 dark:bg-zinc-800', text: 'text-zinc-900 dark:text-zinc-200', border: 'border-zinc-300 dark:border-zinc-700', hex: '#6366f1' },
  { name: 'Purple', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', hex: '#a855f7' },
  { name: 'Slate', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', hex: '#64748b' },
];

export const STATUS_COLORS: Record<string, string> = {
  'Belum Mulai': 'bg-slate-200 text-slate-700',
  'Proses': 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200',
  'Selesai': 'bg-emerald-100 text-emerald-700',
  'Ulang': 'bg-rose-100 text-rose-700'
};

export const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'bg-gray-100 text-gray-600',
  'Medium': 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100',
  'High': 'bg-rose-100 text-rose-600'
};
