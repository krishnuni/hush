export function FoldMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="34"
      viewBox="0 0 28 34"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 2h15l7 7v23H3V2Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 2v8h7M9 15h10M9 20h10M9 25h5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m18 2 7 7h-7V2Z" fill="currentColor" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <FoldMark />
      <span>
        hush<span className="brand-stop">.</span>
      </span>
    </span>
  );
}
