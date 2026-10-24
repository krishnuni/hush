import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
