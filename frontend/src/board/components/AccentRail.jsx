export default function AccentRail({
  progress = 0,
  indeterminate = false,
  waveSpeedMs = 1200,
}) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0))
  const activeWidth = indeterminate ? '42%' : `${safeProgress}%`

  return (
    <div style={{ paddingInline: '0.2rem' }}>
      <div
        className="expressive-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : safeProgress}
        aria-valuetext={indeterminate ? 'Loading' : `${safeProgress}%`}
        style={{
          '--expressive-wave-duration': `${waveSpeedMs}ms`,
        }}
      >
        <div
          className={`expressive-progress-active${indeterminate ? ' is-indeterminate' : ''}`}
          style={{ width: activeWidth }}
        >
          <svg
            className="expressive-progress-wave"
            viewBox="0 0 240 20"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 10 Q 15 1, 30 10 T 60 10 T 90 10 T 120 10 T 150 10 T 180 10 T 210 10 T 240 10 L 240 20 L 0 20 Z" />
          </svg>
        </div>
        <span className="expressive-progress-stop" />
      </div>
    </div>
  )
}
