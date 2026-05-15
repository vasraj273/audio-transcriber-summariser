export default function Tooltip({ text, children, placement = "top", className = "" }) {
  const positionClass = placement === "bottom"
    ? "top-full mt-2"
    : placement === "left"
    ? "right-full mr-2 top-1/2 -translate-y-1/2"
    : placement === "right"
    ? "left-full ml-2 top-1/2 -translate-y-1/2"
    : "bottom-full mb-2";
  const horizontalClass = placement === "top" || placement === "bottom" ? "left-1/2 -translate-x-1/2" : "";

  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute z-50 ${positionClass} ${horizontalClass} max-w-xs whitespace-normal rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

export function HelpIcon({ text, className = "" }) {
  return (
    <Tooltip text={text} className={className}>
      <svg className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </Tooltip>
  );
}
