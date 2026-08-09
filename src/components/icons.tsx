interface IconProps {
  className?: string
}

const commonProps = {
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function DepthIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M3 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2" />
      <path d="M3 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2" />
    </svg>
  )
}

export function DurationIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function PhotoIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M8 6l1.5-2h5L16 6" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

export function SignedIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M4 13l5 5L20 6" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.2 4.2l1.4 1.4" />
      <path d="M18.4 18.4l1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.2 19.8l1.4-1.4" />
      <path d="M18.4 5.6l1.4-1.4" />
    </svg>
  )
}

export function CloudIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M7 18a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 18 11.5a3.5 3.5 0 0 1-.5 6.5z" />
    </svg>
  )
}

export function RainIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M6.5 13.5a3 3 0 0 1 .4-6A4.3 4.3 0 0 1 15 8.7a2.7 2.7 0 0 1-.4 5.3z" />
      <path d="M9 17l-1 2" />
      <path d="M13 17l-1 2" />
      <path d="M17 17l-1 2" />
    </svg>
  )
}

export function WeatherOtherIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M15.5 4v2" />
      <path d="M19.8 6.2l-1.4 1.4" />
      <path d="M21.5 10h-2" />
      <circle cx="15.5" cy="10" r="2.5" />
      <path d="M6.5 18.5a3 3 0 0 1 .4-6A4.3 4.3 0 0 1 15 12.7a2.7 2.7 0 0 1-.4 5.3z" />
    </svg>
  )
}

export function CreatureIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M4 12c3-4 8-5 12-1-4 4-9 3-12 1z" />
      <path d="M16 11l4-3v8l-4-3" />
      <path d="M8.5 11.5h.01" />
    </svg>
  )
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M4 20h4L18 10l-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  )
}

export function NoneIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 15.5l7-7" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function ExpandIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M4 9V4h5" />
      <path d="M20 15v5h-5" />
      <path d="M4 4l6 6" />
      <path d="M20 20l-6-6" />
    </svg>
  )
}

export function EraserIcon({ className }: IconProps) {
  return (
    <svg className={className} {...commonProps}>
      <path d="M7 21h10" />
      <path d="M4 16l6-6 6 6-3 3H7z" />
    </svg>
  )
}
