import React from 'react';
import { Loader2 } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={36} className="text-neutral-300 dark:text-neutral-700 mb-4" />}
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-neutral-500 dark:text-neutral-500 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary-500" />
    </div>
  );
}
