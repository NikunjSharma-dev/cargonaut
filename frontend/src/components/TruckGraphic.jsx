import { useId } from 'react'

/**
 * Side-view vehicle illustrations used across the tracking screens.
 *
 * `fillPercent` (0-100) paints a cargo-load overlay inside the body of the
 * vehicle, anchored towards the cab the way freight is actually loaded.
 */

const BODY = 'var(--truck-body)'
const OUTLINE = 'var(--truck-outline)'
const GLASS = 'var(--truck-glass)'
const PANEL = 'var(--truck-panel)'
const CHASSIS = 'var(--truck-chassis)'
const TIRE = '#32353c'
const RIM = '#b3b9c4'

// Cargo bay each variant fills — also re-stroked over the load overlay
const CARGO_AREA = {
  semi: { x: 16, y: 14, w: 224, h: 66, rx: 4 },
  box: { x: 24, y: 22, w: 180, h: 56, rx: 4 },
  van: { x: 34, y: 26, w: 150, h: 54, rx: 4 },
}

function Wheel({ cx, cy = 104, r = 16 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TIRE} />
      <circle cx={cx} cy={cy} r={r * 0.46} fill={RIM} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill="#8d93a0" />
    </g>
  )
}

export default function TruckGraphic({
  variant = 'semi',
  fillPercent = null,
  showLabel = false,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const stripeId = `stripe-${uid}`
  const clipId = `clip-${uid}`

  const cargo = CARGO_AREA[variant] || CARGO_AREA.semi
  const pct = fillPercent === null ? null : Math.max(0, Math.min(100, fillPercent))
  const fillWidth = pct === null ? 0 : (cargo.w * pct) / 100
  const fillX = cargo.x + cargo.w - fillWidth

  return (
    <svg
      viewBox="0 0 360 130"
      className={className}
      role="img"
      aria-label={`${variant} vehicle${pct !== null ? `, ${pct}% loaded` : ''}`}
    >
      <defs>
        <pattern id={stripeId} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="16" height="16" fill="var(--primary)" />
          <rect width="7" height="16" fill="#ffffff" opacity="0.10" />
        </pattern>
        <clipPath id={clipId}>
          <rect x={cargo.x} y={cargo.y} width={cargo.w} height={cargo.h} rx={cargo.rx} />
        </clipPath>
      </defs>

      <ellipse cx="180" cy="122" rx="152" ry="5" fill="var(--truck-outline)" opacity="0.18" />

      {variant === 'semi' && (
        <g>
          {/* Tractor unit — drawn first so the trailer nose overhangs it */}
          <rect x="232" y="80" width="118" height="12" rx="4" fill={CHASSIS} />
          <rect x="240" y="18" width="68" height="66" rx="10" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <rect x="282" y="26" width="26" height="28" rx="5" fill={GLASS} stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="302" y="52" width="38" height="32" rx="8" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <rect x="340" y="66" width="10" height="16" rx="3" fill={PANEL} stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="273" y="32" width="9" height="7" rx="2" fill={PANEL} stroke={OUTLINE} strokeWidth="1.2" />

          {/* Trailer */}
          <rect x="18" y="80" width="224" height="10" rx="3" fill={CHASSIS} />
          <rect x="172" y="88" width="7" height="16" rx="2" fill={RIM} />
          <rect x="12" y="10" width="232" height="74" rx="6" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <rect x="16" y="14" width="224" height="8" rx="3" fill={PANEL} />
        </g>
      )}

      {variant === 'box' && (
        <g>
          <rect x="26" y="78" width="232" height="11" rx="3" fill={CHASSIS} />
          {/* Cab with sloped nose */}
          <path
            d="M206 16 h72 a10 10 0 0 1 8 4 l26 34 a12 12 0 0 1 2 7 v16 a4 4 0 0 1 -4 4 h-104 z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <path d="M282 24 h4 l22 30 h-26 z" fill={GLASS} stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="308" y="66" width="12" height="12" rx="3" fill={PANEL} />
          {/* Cargo box */}
          <rect x="18" y="16" width="192" height="62" rx="6" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <rect x="24" y="22" width="180" height="7" rx="3" fill={PANEL} />
          <Wheel cx={72} cy={94} r={17} />
          <Wheel cx={262} cy={94} r={17} />
        </g>
      )}

      {variant === 'van' && (
        <g>
          <rect x="34" y="76" width="238" height="10" rx="3" fill={CHASSIS} />
          <path
            d="M28 22 h198 a6 6 0 0 1 4 1 l40 30 h44 a14 14 0 0 1 13 9 l9 22 a4 4 0 0 1 -4 6 h-304 a6 6 0 0 1 -6 -6 v-56 a6 6 0 0 1 6 -6 z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth="2"
          />
          <path d="M232 26 l34 26 h-34 z" fill={GLASS} stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="176" y="30" width="46" height="22" rx="4" fill={GLASS} opacity="0.7" stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="322" y="62" width="12" height="10" rx="3" fill={PANEL} />
          <Wheel cx={82} cy={90} r={17} />
          <Wheel cx={276} cy={90} r={17} />
        </g>
      )}

      {/* Cargo load overlay, then the bay outline is redrawn on top of it */}
      {pct !== null && pct > 0 && (
        <>
          <g clipPath={`url(#${clipId})`}>
            <rect x={fillX} y={cargo.y} width={fillWidth} height={cargo.h} fill={`url(#${stripeId})`} />
            <rect x={fillX} y={cargo.y} width={fillWidth} height="7" fill="#ffffff" opacity="0.16" />
            <rect x={fillX} y={cargo.y + cargo.h - 6} width={fillWidth} height="6" fill="var(--truck-outline)" opacity="0.18" />
          </g>
          <rect
            x={cargo.x} y={cargo.y} width={cargo.w} height={cargo.h} rx={cargo.rx}
            fill="none" stroke={OUTLINE} strokeWidth="1.5"
          />
        </>
      )}

      {/* Semi wheels sit above the load overlay so the trailer reads as one unit */}
      {variant === 'semi' && (
        <g>
          <Wheel cx={56} />
          <Wheel cx={92} />
          <Wheel cx={128} />
          <Wheel cx={272} />
          <Wheel cx={326} />
        </g>
      )}

      {showLabel && pct !== null && (
        <text
          x={fillX + fillWidth / 2}
          y={cargo.y + cargo.h / 2 + 13}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="38"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          letterSpacing="-1"
        >
          {pct}%
        </text>
      )}
    </svg>
  )
}
