import React from 'react';

type BadgeVariant = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'orange';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  green:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blue:   'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  gray:   'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const dotStyles: Record<BadgeVariant, string> = {
  green:  'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500',
  blue:   'bg-primary-500', gray:   'bg-neutral-400', orange: 'bg-orange-500',
};

export default function Badge({ variant = 'gray', children, size = 'sm', dot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-md ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${styles[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />}
      {children}
    </span>
  );
}
