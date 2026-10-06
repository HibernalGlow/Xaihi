export function LaneCollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 15 10" fill="none" aria-hidden="true">
      <path
        d="M11.75 0.75H2.75C1.64543 0.75 0.75 1.64543 0.75 2.75V6.75C0.75 7.85457 1.64543 8.75 2.75 8.75H11.75C12.8546 8.75 13.75 7.85457 13.75 6.75V2.75C13.75 1.64543 12.8546 0.75 11.75 0.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="0.75"
        y="0.75"
        width="5"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={collapsed ? "currentColor" : "none"}
        className="transition-[fill]"
      />
    </svg>
  )
}
