"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

/** Gold hexagonal shield with a gavel, flanked by two blades: flat facets, no gradient */
export const Emblem = () => (
  <svg className="emblem" viewBox="0 0 160 64" aria-hidden="true">
    <polygon points="4,31 48,26.5 58,31" fill="#ffd96a" />
    <polygon points="4,31 58,31 48,35.5" fill="#b8771a" />
    <polygon points="156,31 112,26.5 102,31" fill="#ffd96a" />
    <polygon points="156,31 102,31 112,35.5" fill="#b8771a" />
    <polygon points="58,4 102,4 110,18 104,44 80,62 56,44 50,18" fill="#dc9e28" stroke="#8c5210" strokeWidth="1.5" strokeLinejoin="round" />
    <polygon points="58,4 102,4 98,9 62,9" fill="#ffd96a" />
    <polygon points="50,18 58,4 62,9 56,19" fill="#f2bd3c" />
    <polygon points="102,4 110,18 104,19 98,9" fill="#f2bd3c" />
    <polygon points="50,18 56,44 61,41 56,19" fill="#e8ad33" />
    <polygon points="110,18 104,44 99,41 104,19" fill="#b8771a" />
    <polygon points="56,44 80,62 80,56 61,41" fill="#b8771a" />
    <polygon points="104,44 80,62 80,56 99,41" fill="#8c5210" />
    <polygon points="62,9 98,9 104,19 99,41 80,56 61,41 56,19" fill="#4f1a80" />
    <polygon points="62,9 98,9 80,30 56,19" fill="#64259c" />
    <polygon points="99,41 80,56 80,30" fill="#3c1366" />
    <g className="emblem-gavel">
      <g transform="rotate(-35 78 26)">
        <rect x="76" y="30" width="4.5" height="18" fill="#b8771a" />
        <rect x="67" y="21" width="22" height="10" rx="1.5" fill="#f2bd3c" />
        <rect x="67" y="21" width="3.5" height="10" fill="#b8771a" />
        <rect x="85.5" y="21" width="3.5" height="10" fill="#b8771a" />
        <rect x="70.5" y="21" width="15" height="3" fill="#ffd96a" />
      </g>
    </g>
    <rect x="68" y="42" width="14" height="3.5" fill="#b8771a" />
    <rect x="68" y="42" width="14" height="1.5" fill="#ffd96a" />
  </svg>
);

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "neutral";

type GameButtonProps = Omit<ComponentProps<"button">, "type"> & {
  variant?: ButtonVariant;
  loading?: boolean;
  selected?: boolean;
};

/** Chamfered game button; the same classes style links that look like buttons */
export const GameButton = ({ variant = "secondary", loading = false, selected, disabled, className, children, ...rest }: GameButtonProps) => (
  <button
    type="button"
    className={`plate btn btn-${variant}${className === undefined ? "" : ` ${className}`}`}
    disabled={disabled === true || loading}
    aria-busy={loading || undefined}
    aria-pressed={selected}
    {...rest}
  >
    {loading && <span className="btn-spinner" aria-hidden="true" />}
    {children}
  </button>
);

type GameDialogProps = {
  title: string;
  size?: "compact" | "standard";
  /** Defaults to the gavel emblem; null hides it */
  emblem?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

/** Gold-framed dialog: emblem on the top edge, title, body, then actions laid out by their count */
export const GameDialog = ({ title, size = "standard", emblem = <Emblem />, subtitle, actions, children }: GameDialogProps) => {
  const titleId = useId();

  return (
    <section className={`plate dialog dialog-${size}`} aria-labelledby={titleId}>
      {emblem !== null && <div className="dialog-emblem">{emblem}</div>}
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      {subtitle}
      {children !== undefined && children !== null && children !== false && <div className="dialog-body">{children}</div>}
      {actions !== undefined && <div className="dialog-actions">{actions}</div>}
    </section>
  );
};
