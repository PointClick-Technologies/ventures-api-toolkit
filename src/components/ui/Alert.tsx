import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import React from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const config: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  info:    { icon: Info,          classes: 'bg-primary-50 border-primary-200 text-primary-800 dark:bg-primary-900/20 dark:border-primary-800 dark:text-primary-300' },
  success: { icon: CheckCircle,   classes: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' },
  error:   { icon: XCircle,       classes: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' },
};

export default function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const { icon: Icon, classes } = config[variant];
  return (
    <div className={`flex gap-3 p-4 rounded-lg border text-sm ${classes} ${className}`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div>
        {title && <div className="font-medium mb-0.5">{title}</div>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}
