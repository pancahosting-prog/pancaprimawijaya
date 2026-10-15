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
  { name: 'Zinc', bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200', hex: '#71717a' },
  { name: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hex: '#10b981' },
  { name: 'Amber', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', hex: '#f59e0b' },
  { name: 'Rose', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', hex: '#f43f5e' },
  { name: 'Slate', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', hex: '#64748b' },
  { name: 'Black', bg: 'bg-zinc-900', text: 'text-white', border: 'border-zinc-800', hex: '#000000' },
  { name: 'Gray', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', hex: '#9ca3af' },
];

export const STATUS_COLORS: Record<string, string> = {
  'Belum Mulai': 'bg-slate-100 text-slate-500 border border-slate-200',
  'Proses': 'bg-zinc-900 text-white shadow-sm',
  'Selesai': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Ulang': 'bg-rose-100 text-rose-700 border border-rose-200'
};

export const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'bg-gray-100 text-gray-500 border border-gray-200',
  'Medium': 'bg-zinc-100 text-zinc-700 border border-zinc-300',
  'High': 'bg-zinc-900 text-white shadow-sm'
};
