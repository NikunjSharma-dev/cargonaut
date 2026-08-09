import { useId } from 'react'

/**
 * Side-view fleet asset illustrations used across the tracking screens.
 *
 * Road units (`semi`, `box`, `van`) and air units (`freighter`, `turboprop`)
 * share one viewBox and one palette of CSS variables, so a mixed fleet list
 * reads as a single set of drawings and re-themes automatically.
 *
 * `fillPercent` (0-100) paints a cargo-load overlay inside the body, anchored
 * towards the cab — or the nose — the way freight is actually loaded.
 */

const BODY = 'var(--truck-body)'
const OUTLINE = 'var(--truck-outline)'
const GLASS = 'var(--truck-glass)'
const PANEL = 'var(--truck-panel)'
const CHASSIS = 'var(--truck-chassis)'
const TIRE = '#32353c'
const RIM = '#b3b9c4'

// Cargo bay each variant fills — also re-stroked over the load overlay.
// `slots` splits an aircraft deck into ULD positions.
const CARGO_AREA = {
  semi: { x: 16, y: 14, w: 224, h: 66, rx: 4 },
  box: { x: 24, y: 22, w: 180, h: 56, rx: 4 },
  van: { x: 34, y: 26, w: 150, h: 54, rx: 4 },
  freighter: { x: 54, y: 46, w: 246, h: 26, rx: 3, slots: 8 },
  turboprop: { x: 62, y: 52, w: 214, h: 22, rx: 3, slots: 5 },
}

const AIR_VARIANTS = new Set(['freighter', 'turboprop'])

function Wheel({ cx, cy = 104, r = 16 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TIRE} />
      <circle cx={cx} cy={cy} r={r * 0.46} fill={RIM} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill="#8d93a0" />
    </g>
  )
}

/** Row of cabin windows / cargo-door rivets along a fuselage. */
function Windows({ from, to, y, step = 16, r = 1.6 }) {
  const dots = []
  for (let x = from; x <= to; x += step) dots.push(x)
  return (
    <g fill={OUTLINE} opacity="0.5">
      {dots.map(x => <circle key={x} cx={x} cy={y} r={r} />)}
    </g>
  )
}

export default function VehicleGraphic({
  variant = 'semi',
  fillPercent = null,
  showLabel = false,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const stripeId = `stripe-${uid}`
  const clipId = `clip-${uid}`

  const cargo = CARGO_AREA[variant] || CARGO_AREA.semi
  const isAir = AIR_VARIANTS.has(variant)
  const pct = fillPercent === null ? null : Math.max(0, Math.min(100, fillPercent))
  const fillWidth = pct === null ? 0 : (cargo.w * pct) / 100
  const fillX = cargo.x + cargo.w - fillWidth
  const labelSize = Math.round(cargo.h * 0.58)

  return (
    <svg
      viewBox="0 0 360 130"
      className={className}
      role="img"
      aria-label={`${variant} ${isAir ? 'aircraft' : 'vehicle'}${pct !== null ? `, ${pct}% loaded` : ''}`}
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

      <ellipse
        cx="180"
        cy={isAir ? 118 : 122}
        rx={isAir ? 130 : 152}
        ry="5"
        fill="var(--truck-outline)"
        opacity="0.18"
      />

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

      {variant === 'freighter' && (
        <g>
          {/* Far wing and stabiliser sit behind the fuselage */}
          <path d="M188 68 L112 44 L96 44 L172 68 Z" fill={PANEL} stroke={OUTLINE} strokeWidth="1.2" />
          <path d="M46 46 L14 32 L8 38 L40 52 Z" fill={PANEL} stroke={OUTLINE} strokeWidth="1.2" />

          {/* Vertical fin, swept back over the upswept tail cone */}
          <path d="M56 48 L32 8 L20 8 L16 50 Z" fill={BODY} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M52 46 L34 16 L26 16 L22 46 Z" fill={PANEL} opacity="0.7" />

          {/* Fuselage: nose right, tail cone sweeping up to the left */}
          <path
            d="M44 44 L302 40 C 322 40 336 49 338 61 C 336 71 323 76 304 76 L74 76 L22 50 Z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Flight deck + main-deck cargo door */}
          <path d="M310 46 h12 a14 14 0 0 1 11 9 h-23 z" fill={GLASS} stroke={OUTLINE} strokeWidth="1.4" />
          <rect x="196" y="45" width="76" height="27" rx="3" fill="none" stroke={OUTLINE} strokeWidth="1.3" opacity="0.75" />
          <Windows from={84} to={180} y={50} step={17} />

          {/* Near wing sweeping down toward the viewer */}
          <path d="M206 70 L128 100 L102 100 L186 70 Z" fill={BODY} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />

          {/* Underwing engine */}
          <rect x="128" y="80" width="8" height="10" fill={CHASSIS} />
          <rect x="106" y="86" width="52" height="22" rx="11" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <path d="M152 87 a11 11 0 0 1 0 20 z" fill={PANEL} />
          <circle cx="112" cy="97" r="6" fill={GLASS} opacity="0.8" />

          {/* Nose gear and main gear with connected struts */}
          <rect x="295.5" y="74" width="5" height="16" fill={OUTLINE} />
          <Wheel cx={298} cy={90} r={7} />
          <rect x="181.5" y="74" width="5" height="18" fill={OUTLINE} />
          <rect x="199.5" y="74" width="5" height="18" fill={OUTLINE} />
          <Wheel cx={184} cy={92} r={8} />
          <Wheel cx={202} cy={92} r={8} />
        </g>
      )}

      {variant === 'turboprop' && (
        <g>
          {/* T-tail: fin with the stabiliser mounted across its top */}
          <path d="M62 54 L38 14 L26 14 L22 56 Z" fill={BODY} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M52 18 L8 12 L6 19 L50 25 Z" fill={PANEL} stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" />

          {/* Fuselage */}
          <path
            d="M52 50 L290 47 C 308 47 320 55 322 65 C 320 74 308 79 292 79 L80 79 L30 56 Z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M296 52 h10 a12 12 0 0 1 10 8 h-20 z" fill={GLASS} stroke={OUTLINE} strokeWidth="1.4" />
          {/* Forward cargo door — the ATR freighter loads through the nose section */}
          <rect x="212" y="52" width="58" height="23" rx="3" fill="none" stroke={OUTLINE} strokeWidth="1.3" opacity="0.75" />
          <Windows from={96} to={190} y={57} step={16} r={1.5} />

          {/* High wing across the top of the fuselage */}
          <path d="M232 47 L120 39 L96 39 L214 47 Z" fill={BODY} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />

          {/* Turboprop nacelle with the propeller disc facing the nose */}
          <rect x="150" y="34" width="66" height="20" rx="10" fill={BODY} stroke={OUTLINE} strokeWidth="2" />
          <path d="M216 36 a10 10 0 0 1 0 16 z" fill={PANEL} />
          <ellipse cx="222" cy="44" rx="3" ry="26" fill={GLASS} opacity="0.55" />
          <ellipse cx="222" cy="44" rx="1.6" ry="26" fill={OUTLINE} opacity="0.5" />

          {/* Gear: nose leg plus the sponson-mounted main gear */}
          <rect x="281.5" y="78" width="5" height="14" fill={OUTLINE} />
          <Wheel cx={284} cy={92} r={7} />
          <path d="M150 79 h44 a8 8 0 0 1 8 8 v4 h-60 v-4 a8 8 0 0 1 8 -8 z" fill={PANEL} stroke={OUTLINE} strokeWidth="1.5" />
          <rect x="155.5" y="87" width="5" height="7" fill={OUTLINE} />
          <rect x="185.5" y="87" width="5" height="7" fill={OUTLINE} />
          <Wheel cx={158} cy={94} r={7} />
          <Wheel cx={188} cy={94} r={7} />
        </g>
      )}

      {/* Cargo load overlay, then the bay outline is redrawn on top of it */}
      {pct !== null && pct > 0 && (
        <>
          <g clipPath={`url(#${clipId})`}>
            <rect x={fillX} y={cargo.y} width={fillWidth} height={cargo.h} fill={`url(#${stripeId})`} />
            <rect x={fillX} y={cargo.y} width={fillWidth} height={isAir ? 4 : 7} fill="#ffffff" opacity="0.16" />
            <rect
              x={fillX}
              y={cargo.y + cargo.h - (isAir ? 4 : 6)}
              width={fillWidth}
              height={isAir ? 4 : 6}
              fill="var(--truck-outline)"
              opacity="0.18"
            />
            {/* ULD positions: the deck is loaded slot by slot, not as a smooth bar */}
            {cargo.slots && Array.from({ length: cargo.slots - 1 }, (_, i) => {
              const x = cargo.x + (cargo.w / cargo.slots) * (i + 1)
              return (
                <line
                  key={i}
                  x1={x} y1={cargo.y} x2={x} y2={cargo.y + cargo.h}
                  stroke="#ffffff" strokeWidth="1.2" opacity="0.35"
                />
              )
            })}
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
          y={cargo.y + cargo.h / 2 + labelSize / 3}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={labelSize}
          fontWeight="800"
          fontFamily="Geist, system-ui, sans-serif"
          letterSpacing="-1"
        >
          {pct}%
        </text>
      )}
    </svg>
  )
}
