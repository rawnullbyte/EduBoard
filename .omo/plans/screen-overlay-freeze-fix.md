# Screen Overlay Freeze Fix

## TL;DR
> **Summary**: Fix the frontend black overlay that freezes during class→break transitions. The overlay (introduced in commit `57ebaf2`) stays permanently black after the 60s data refresh cycle because: (1) browser compositor deprioritizes the static all-black viewport, throttling JS timers; (2) page rotation & content rendering waste cycles behind overlay; (3) no error boundary allows a render crash to permanently lock the overlay state.
> **Deliverables**: `useScreenState` hook, overlay optimizations (pause rotation, skip content render), animated overlay indicator, ErrorBoundary, CSS transitions
> **Effort**: Medium (5-6 files, ~200 lines total)
> **Parallel**: YES - 2 waves
> **Critical Path**: useScreenState hook → overlay rendering optimization → ErrorBoundary

## Context
### Original Request
Screen should turn off during class and on during breaks via frontend overlay. Currently it shows black screen and freezes before break ends after booting up fully.

### Interview Summary
- App works fine when booted during break (content visible)
- After the 60s data refresh cycle (`REFRESH_SECONDS`), overlay incorrectly stays on during break
- Happens 100% consistently
- The "freeze" is the overlay not hiding when it should — not a JS crash, but the overlay state stops updating

### Root Cause Analysis (from code review)
**Primary cause**: The overlay `<div>` is a bare element with `backgroundColor: 'black'`, `position: fixed`, `inset: 0`, `zIndex: 9999`, and **no children** — zero visual change for the entire class duration (e.g., 45 minutes). Firefox ESR in Sway/Wayland kiosk mode detects no visible change and deprioritizes the compositor pipeline. This cascades into throttled `setInterval` timers (the 1s `useBoardClock` and 200ms `usePageRotation`), causing the `showOverlay` `useMemo` to stop updating against `now`.

**Secondary causes**:
1. `usePageRotation` interval (200ms) runs continuously during overlay — unnecessary CPU + state updates
2. Full page content (TimetablePage, EventsPage, TopBar, AccentRail) renders behind overlay — wasted rendering + potential render errors on data refresh
3. `TimetablePage.jsx` re-imports `useBoardClock` creating a SECOND independent clock interval
4. No ErrorBoundary — if any component throws during render post-data-refresh, React unmounts the tree and the last committed DOM state (overlay visible) persists permanently
5. `showOverlay` in `useMemo` is fragile — it recomputes during render, and if `startTransition` defers the payload update (React 19 concurrent), the overlay might use stale timetable data

## Work Objectives
### Core Objective
Fix the frontend black overlay so it reliably hides when class ends and break starts, without freezing.

### Deliverables
1. New `useScreenState.js` hook — isolated overlay logic with robust scheduling
2. Overlay rendering optimizations — pause `usePageRotation` timer when overlay active, skip content rendering
3. Subtle animated indicator on the overlay (prevents browser compositor idle)
4. CSS fade transition for overlay appearance/disappearance
5. ErrorBoundary component wrapping board content
6. Remove duplicate `useBoardClock` from `TimetablePage.jsx`

### Definition of Done (verifiable conditions)
- [ ] After boot during class: overlay shows black within 2s of data load
- [ ] At class→break boundary (exact minute): overlay fades out within 2s
- [ ] At break→class boundary (exact minute): overlay fades in within 2s
- [ ] After 3+ hours of continuous runtime: transitions still work
- [ ] Data refresh cycle (every 60s) does not cause overlay to stick
- [ ] ErrorBoundary catches render errors and shows fallback UI without breaking overlay
- [ ] Page rotation timer stops when overlay is shown (verified via console.log)
- [ ] TimetablePage no longer reimports useBoardClock

### Must Have
- Reliable class→break overlay transition after extended runtime
- Recovery from render errors without permanent black screen

### Must NOT Have (guardrails)
- No system-level screen control (no swaylock, no wlr-randr in this fix)
- No changes to backend (`main.py`, `api/`)
- No changes to data fetching (`useBoardData.js`, `boardData.js`)
- No CSS framework changes
- No removing the overlay mechanism — the frontend-only approach stays

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- **Test decision**: No test framework exists — manual QA via break/class simulation
- **QA policy**: Every task has agent-executed validation scenarios
- **Evidence**: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves

**Wave 1** (foundation — files with no interdependencies):
- Task 1: `useScreenState.js` hook
- Task 2: `ErrorBoundary.jsx` component
- Task 3: CSS transition class + animated overlay indicator in `index.css`

**Wave 2** (depends on Wave 1 — integrates everything):
- Task 4: `App.jsx` — wire useScreenState, conditional content rendering, pause rotation
- Task 5: `usePageRotation.js` — accept overlay-aware pause control
- Task 6: `TimetablePage.jsx` — remove duplicate useBoardClock import

### Dependency Matrix
| Task | Blocks | Blocked By |
|------|--------|------------|
| 1. useScreenState hook | Task 4 | — |
| 2. ErrorBoundary | Task 4 | — |
| 3. CSS + animated indicator | Task 4 | — |
| 4. App.jsx integration | — | 1, 2, 3 |
| 5. usePageRotation pause | Task 4 | — |
| 6. TimetablePage cleanup | — | — |

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 1, 2, 3 | quick (3 files, isolated) |
| 2 | 4, 5, 6 | unspecified-high (integration, careful wiring) |

## TODOs

- [ ] 1. Create `useScreenState.js` hook

  **What to do**: Create a new hook in `frontend/src/board/hooks/useScreenState.js` that encapsulates overlay logic in an isolated, error-hardened way.

  The hook should:
  - Accept `timetable` and `loading` and `hasBoardData` as parameters
  - Use `useRef` for the current screen state (avoids re-render dependency issues)
  - Use a dedicated `setInterval` at **1 second** exclusively for overlay checks
  - NOT depend on `useBoardClock`'s `now` — compute time independently inside the interval callback using `new Date()` directly
  - Return `{ showOverlay: boolean }`
  - Use `useCallback` and `useRef` to avoid stale closures with timetable data
  - Handle edge cases:
    - No timetable data → overlay hidden (show content)
    - Empty items array → overlay shown (safe default for no-lesson period)
    - Loading state → overlay hidden
    - `starttime`/`endtime` comparisons use string comparison (HH:MM format from API is consistent)

  **Logic** (same as current but in a ref-safe interval):
  ```js
  // Inside 1s interval callback:
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const nowStr = `${h}:${m}`
  
  const allItems = (timetable?.classes ?? []).flatMap(cls => cls.ttitems ?? [])
  const isInClass = allItems.some(item => item.starttime <= nowStr && nowStr < item.endtime)
  const schoolStart = allItems.map(i => i.starttime).filter(Boolean).sort()[0] ?? ''
  const schoolEnd = allItems.map(i => i.endtime).filter(Boolean).sort().slice(-1)[0] ?? ''
  const isSchoolTime = nowStr >= schoolStart && nowStr < schoolEnd
  const next = !(isSchoolTime && !isInClass)
  ```
  
  Use refs for timetable/loading/hasBoardData to avoid interval recreation:
  ```js
  const timetableRef = useRef(timetable)
  timetableRef.current = timetable
  // same for loading, hasBoardData
  ```

  **Must NOT do**:
  - Do NOT import or use `useBoardClock`
  - Do NOT use `useMemo` for the overlay state — use interval + refs
  - Do NOT add any system-level screen control

  **Recommended Agent Profile**:
  - Category: `quick` — single file, ~40 lines, isolated logic
  - Skills: none needed
  - Omitted: none

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4 | Blocked By: —

  **References**:
  - Pattern: `frontend/src/board/hooks/useBoardClock.js` — interval setup pattern
  - Existing overlay logic: `frontend/src/App.jsx:20-44` — the current showOverlay useMemo (to replicate in hook)
  - Type/format: Timetable items have `starttime`/`endtime` as `"HH:MM"` strings — `frontend/src/board/boardData.js:119-137`

  **Acceptance Criteria**:
  - [ ] File exists at `frontend/src/board/hooks/useScreenState.js`
  - [ ] Exports `useScreenState` function
  - [ ] Returns `{ showOverlay: boolean }`
  - [ ] Uses internal 1s `setInterval` with `Date.now()` — NOT useBoardClock's `now`
  - [ ] Uses refs for input params to avoid interval recreation
  - [ ] Cleanup on unmount (`clearInterval`)

  **QA Scenarios**:
  ```
  Scenario: Hook exports correct shape
    Tool: Bash
    Steps: grep -c "export function useScreenState" frontend/src/board/hooks/useScreenState.js; grep -c "showOverlay" frontend/src/board/hooks/useScreenState.js
    Expected: Both grep counts return >= 1
    Evidence: .omo/evidence/task-1-hook-exports.txt

  Scenario: Hook uses internal interval not useBoardClock
    Tool: Bash
    Steps: grep -c "useBoardClock" frontend/src/board/hooks/useScreenState.js; grep -c "setInterval" frontend/src/board/hooks/useScreenState.js
    Expected: useBoardClock grep = 0, setInterval grep >= 1
    Evidence: .omo/evidence/task-1-no-clock-dependency.txt

  Scenario: Hook handles empty timetable gracefully
    Tool: interactive_bash
    Steps: Check that hook doesn't throw with timetable=null/undefined (test by importing in node or verify defensive checks exist)
    Expected: Optional chaining (?.) or null checks present
    Evidence: .omo/evidence/task-1-null-safety.txt
  ```

  **Commit**: YES | Message: `feat: add useScreenState hook for isolated overlay state` | Files: `frontend/src/board/hooks/useScreenState.js`

---

- [ ] 2. Create `ErrorBoundary.jsx` component

  **What to do**: Create a class-based ErrorBoundary in `frontend/src/board/components/ErrorBoundary.jsx` (React error boundaries require class components — cannot use hooks).

  ```jsx
  import { Component } from 'react'

  export default class ErrorBoundary extends Component {
    constructor(props) {
      super(props)
      this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    componentDidCatch(error, info) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }

    render() {
      if (this.state.hasError) {
        return this.props.fallback ?? (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'var(--md-sys-color-surface, #131416)',
            display: 'grid', placeItems: 'center',
            color: 'var(--md-sys-color-on-surface, #e4e6eb)',
            fontSize: '1.2rem', padding: '2rem', textAlign: 'center'
          }}>
            <div>
              <h2>Došlo k chybě</h2>
              <p style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                Obrazovka bude brzy obnovena.
              </p>
            </div>
          </div>
        )
      }
      return this.props.children
    }
  }
  ```

  Props: `fallback` (optional ReactNode) | `children` (required)
  The fallback must NOT include the black overlay — it's the recovery UI when content crashes. The overlay state lives OUTSIDE the ErrorBoundary in App.jsx.

  **Must NOT do**:
  - Do NOT wrap the overlay itself in the ErrorBoundary (overlay must remain functional even if content crashes)
  - Do NOT convert to functional component (error boundaries require `componentDidCatch`)

  **Recommended Agent Profile**:
  - Category: `quick` — single file, ~35 lines, standard pattern
  - Skills: none needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4 | Blocked By: —

  **References**:
  - React docs: ErrorBoundary pattern (class component, `getDerivedStateFromError`, `componentDidCatch`)
  - CSS variables from theme: `frontend/src/board/theme/materialTheme.js:10-14` (surface colors)

  **Acceptance Criteria**:
  - [ ] File exists at `frontend/src/board/components/ErrorBoundary.jsx`
  - [ ] Exports a class component as default
  - [ ] Implements `getDerivedStateFromError` and `componentDidCatch`
  - [ ] Shows fallback UI (or default) when error caught
  - [ ] Renders children when no error

  **QA Scenarios**:
  ```
  Scenario: ErrorBoundary class component structure
    Tool: Bash
    Steps: grep -c "extends Component" frontend/src/board/components/ErrorBoundary.jsx; grep -c "getDerivedStateFromError" frontend/src/board/components/ErrorBoundary.jsx
    Expected: Both counts >= 1
    Evidence: .omo/evidence/task-2-errorboundary-class.txt
  ```

  **Commit**: YES | Message: `feat: add ErrorBoundary component for render crash recovery` | Files: `frontend/src/board/components/ErrorBoundary.jsx`

---

- [ ] 3. Add CSS overlay transitions + animated breathing indicator

  **What to do**: Add CSS rules to `frontend/src/index.css`:

  1. **Overlay fade transition** — add a CSS class for the overlay that fades in/out over ~800ms:
  ```css
  .board-overlay {
    opacity: 1;
    transition: opacity 800ms ease;
  }
  .board-overlay.hidden {
    opacity: 0;
    pointer-events: none;
  }
  ```

  2. **Breathing indicator** — a subtle pulsing dot or icon in the center of the overlay that very gently changes opacity. This is the KEY fix — it creates a continuous visual change that prevents the browser compositor from entering idle/low-power state. The animation should be extremely subtle (barely visible) — just enough to trigger repaints:
  ```css
  .board-overlay-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.03);
    animation: overlay-breath 4s ease-in-out infinite;
  }

  @keyframes overlay-breath {
    0%, 100% { opacity: 0.02; transform: scale(1); }
    50% { opacity: 0.06; transform: scale(1.05); }
  }
  ```

  The indicator should be barely visible (opacity 0.02-0.06) — just enough to trigger compositing without being distracting. The breathing animation period is 4s (slow and gentle).

  3. **Surface-level indicator** — only visible when screen is "off" (overlay shown), preventing idle compositor without visible light bleed on an actual black screen.

  **Must NOT do**:
  - Do NOT make the indicator bright or distracting (max opacity 0.06)
  - Do NOT add keyframe animations that consume significant GPU (no complex transforms)

  **Recommended Agent Profile**:
  - Category: `quick` — CSS-only changes, ~30 lines
  - Skills: none needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4 | Blocked By: —

  **References**:
  - Existing CSS: `frontend/src/index.css` — append to this file
  - Current overlay markup: `frontend/src/App.jsx:49-59` — the overlay div that needs CSS classes
  - CSS variable system: `frontend/src/board/theme/materialTheme.js` — color tokens

  **Acceptance Criteria**:
  - [ ] `.board-overlay` class defined with `transition: opacity 800ms ease`
  - [ ] `.board-overlay.hidden` class defined with `opacity: 0; pointer-events: none`
  - [ ] `.board-overlay-indicator` class defined with `animation: overlay-breath 4s ease-in-out infinite`
  - [ ] `@keyframes overlay-breath` defined with 0%/100% opacity 0.02 and 50% opacity 0.06
  - [ ] No colors brighter than rgba(255,255,255,0.06) in the indicator

  **QA Scenarios**:
  ```
  Scenario: CSS classes exist
    Tool: Bash
    Steps: grep -c "board-overlay" frontend/src/index.css
    Expected: Count >= 5 (class names + keyframe)
    Evidence: .omo/evidence/task-3-css-classes.txt
  ```

  **Commit**: YES | Message: `feat: add overlay CSS transitions and breathing indicator` | Files: `frontend/src/index.css`

---

- [ ] 4. Update `usePageRotation.js` — accept overlay-aware pause

  **What to do**: Modify `usePageRotation` hook to accept an optional `paused` parameter. When `paused` is true, the rotation interval should NOT advance pages or update progress.

  Changes:
  - Add `paused` parameter: `export function usePageRotation(pages, paused = false)`
  - Inside the 200ms interval callback, add early return at the top:
    ```js
    if (paused) {
      // Keep the ref updated but don't change state
      cycleStartedAtRef.current = Date.now()
      if (progress !== 0) setProgress(0) // reset progress bar to 0 when paused
      return
    }
    ```
  - When unpaused, the timer resumes from where it left off (cycleStartedAtRef was being updated during pause so it resets the cycle — this is correct behavior: when the screen turns back on, start the rotation cycle fresh)

  **Must NOT do**:
  - Do NOT change any other logic in the hook
  - Do NOT clear/recreate the interval when paused (keep it running, just skip state updates)

  **Recommended Agent Profile**:
  - Category: `quick` — single parameter + early return, ~5 lines changed
  - Skills: none needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: — | Blocked By: Task 1 (uses screen state shape)

  **References**:
  - File: `frontend/src/board/hooks/usePageRotation.js` — existing hook
  - New parameter will be wired from App.jsx using `showOverlay` from useScreenState

  **Acceptance Criteria**:
  - [ ] `usePageRotation` accepts second parameter `paused` (default `false`)
  - [ ] When `paused=true`, interval does not call `setProgress` or `setPageIndex`
  - [ ] When `paused=true`, `cycleStartedAtRef` updates to `Date.now()` each tick
  - [ ] When `paused=false` again, rotation proceeds normally

  **QA Scenarios**:
  ```
  Scenario: Pause parameter exists
    Tool: Bash
    Steps: grep -c "paused" frontend/src/board/hooks/usePageRotation.js
    Expected: Count >= 2 (parameter + usage)
    Evidence: .omo/evidence/task-4-pause-parameter.txt
  ```

  **Commit**: YES | Message: `fix: add pause support to usePageRotation for overlay state` | Files: `frontend/src/board/hooks/usePageRotation.js`

---

- [ ] 5. Remove duplicate `useBoardClock` from `TimetablePage.jsx`

  **What to do**: In `TimetablePage.jsx`:
  - Remove the `import { useBoardClock } from '../hooks/useBoardClock'` line
  - Remove the `const clock = useBoardClock()` call inside the component
  - The `activePeriod` computation uses `new Date()` directly (not from `clock`), so it's unaffected

  This eliminates a SECOND 1-second interval that runs independently. The clock state from the parent `useBoardClock` is sufficient.

  **Must NOT do**:
  - Do NOT remove `import { useBoardClock }` from other files
  - Do NOT change `getActivePeriodIndex` (it uses `new Date()` which is fine)

  **Recommended Agent Profile**:
  - Category: `quick` — remove 2 lines
  - Skills: none needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: — | Blocked By: —

  **References**:
  - File: `frontend/src/board/components/TimetablePage.jsx`
  - Line 3: `import { useBoardClock } from '../hooks/useBoardClock'` — remove
  - Line 24: `const clock = useBoardClock()` — remove
  - Line 12-21: `getActivePeriodIndex` — keep, uses `new Date()` directly

  **Acceptance Criteria**:
  - [ ] `TimetablePage.jsx` no longer imports `useBoardClock`
  - [ ] No `useBoardClock()` call exists in the file
  - [ ] `getActivePeriodIndex` still works correctly
  - [ ] Timetable renders without errors

  **QA Scenarios**:
  ```
  Scenario: useBoardClock removed from TimetablePage
    Tool: Bash
    Steps: grep -c "useBoardClock" frontend/src/board/components/TimetablePage.jsx
    Expected: 0
    Evidence: .omo/evidence/task-5-removed-clock.txt
  ```

  **Commit**: YES | Message: `fix: remove duplicate useBoardClock from TimetablePage` | Files: `frontend/src/board/components/TimetablePage.jsx`

---

- [ ] 6. Rewrite `App.jsx` — integrate useScreenState, conditional rendering, ErrorBoundary

  **What to do**: This is the central integration task. Rewrite `App.jsx` to:

  1. **Import new dependencies**:
  ```jsx
  import { useMemo } from 'react'
  import { getPageTitle } from './board/boardData'
  import AccentRail from './board/components/AccentRail'
  import EmptyPage from './board/components/EmptyPage'
  import EventsPage from './board/components/EventsPage'
  import SubstitutionsPage from './board/components/SubstitutionsPage'
  import TimetablePage from './board/components/TimetablePage'
  import TopBar from './board/components/TopBar'
  import ErrorBoundary from './board/components/ErrorBoundary'
  import { useBoardClock } from './board/hooks/useBoardClock'
  import { useBoardData } from './board/hooks/useBoardData'
  import { usePageRotation } from './board/hooks/usePageRotation'
  import { useScreenState } from './board/hooks/useScreenState'
  ```

  2. **Replace `showOverlay` useMemo with `useScreenState`**:
  ```jsx
  const { loading, hasBoardData, pages, periods, timetable } = useBoardData()
  const { activePage, progress } = usePageRotation(pages, showOverlay) // paused during overlay
  const { now, clockLabel, dateParts } = useBoardClock()
  const { showOverlay } = useScreenState(timetable, loading, hasBoardData)
  ```

  3. **Apply CSS classes to overlay div** instead of inline `style`:
  ```jsx
  <div className={`board-overlay${showOverlay ? '' : ' hidden'}`}>
    {showOverlay && <div className="board-overlay-indicator" />}
  </div>
  ```

  4. **Conditionally render board content** — only render TopBar, AccentRail, and page content when overlay is NOT active:
  ```jsx
  return (
    <div className="board-shell">
      <div className={`board-overlay${showOverlay ? '' : ' hidden'}`}>
        {showOverlay && <div className="board-overlay-indicator" />}
      </div>
      
      {!showOverlay && (
        <>
          <div className="board-surface">
            <TopBar pageTitle={pageTitle} clockLabel={clockLabel} dateParts={dateParts} />
          </div>
          <AccentRail progress={progress} />
          <ErrorBoundary>
            <section className="board-surface" style={{ ... }}>
              <div key={activePageKey} style={{ ... }}>
                {loading && !hasBoardData ? (
                  <EmptyPage ... />
                ) : !hasBoardData ? (
                  <EmptyPage ... />
                ) : activePage?.type === 'timetable' ? (
                  <TimetablePage rows={activePage.rows ?? []} periods={periods} />
                ) : activePage?.type === 'events' ? (
                  <EventsPage events={activePage.events ?? []} />
                ) : activePage?.type === 'substitutions' ? (
                  <SubstitutionsPage substitutions={activePage.substitutions ?? []} />
                ) : (
                  <EmptyPage ... />
                )}
              </div>
            </section>
          </ErrorBoundary>
        </>
      )}
    </div>
  )
  ```

  5. Keep `pageTitle` and `activePageKey` computation for use above.

  6. Remove the old `showOverlay` useMemo block (lines 20-44).

  **Import cleanup**: Remove `useMemo` import if no longer needed after removing old overlay logic. (Actually keep it — `pageTitle` and `activePageKey` may still use it.)

  **Must NOT do**:
  - Do NOT change the layout structure for non-overlay state (board-shell, board-surface classes stay)
  - Do NOT modify the TopBar, AccentRail, or page component logic
  - Do NOT add system-level screen control

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — integration task, careful wiring of 3 new pieces
  - Skills: none needed

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: — | Blocked By: Tasks 1, 2, 3, 4, 5

  **References**:
  - Current App.jsx: `frontend/src/App.jsx` — full rewrite of the component body
  - useScreenState: `frontend/src/board/hooks/useScreenState.js` — new hook
  - ErrorBoundary: `frontend/src/board/components/ErrorBoundary.jsx` — new wrapper
  - usePageRotation: `frontend/src/board/hooks/usePageRotation.js` — updated with pause
  - CSS classes: `frontend/src/index.css` — board-overlay, board-overlay-indicator, hidden

  **Acceptance Criteria**:
  - [ ] `App.jsx` imports `useScreenState` from `../hooks/useScreenState`
  - [ ] `App.jsx` imports `ErrorBoundary` from `./components/ErrorBoundary`
  - [ ] Old `showOverlay` useMemo block (lines 20-44) is REMOVED
  - [ ] Overlay div uses `className="board-overlay"` + conditional `hidden` class
  - [ ] Board content (TopBar, AccentRail, page section) is wrapped in `{!showOverlay && (...)}`
  - [ ] Page content section is wrapped in `<ErrorBoundary>`
  - [ ] Overlay shows `.board-overlay-indicator` when visible
  - [ ] `usePageRotation` is called with `showOverlay` as second argument (paused state)

  **QA Scenarios**:
  ```
  Scenario: useScreenState imported and used
    Tool: Bash
    Steps: grep -c "useScreenState" frontend/src/App.jsx
    Expected: >= 2 (import + call)
    Evidence: .omo/evidence/task-6-uses-screenstate.txt

  Scenario: ErrorBoundary wraps content
    Tool: Bash
    Steps: grep -c "<ErrorBoundary>" frontend/src/App.jsx
    Expected: >= 1
    Evidence: .omo/evidence/task-6-errorboundary-wrapped.txt

  Scenario: Old useMemo overlay logic removed
    Tool: Bash
    Steps: grep -c "isInClass" frontend/src/App.jsx
    Expected: 0
    Evidence: .omo/evidence/task-6-old-logic-removed.txt

  Scenario: CSS class based overlay
    Tool: Bash
    Steps: grep -c 'className="board-overlay' frontend/src/App.jsx
    Expected: >= 1
    Evidence: .omo/evidence/task-6-css-class-overlay.txt

  Scenario: Conditional content rendering
    Tool: Bash
    Steps: grep -c 'showOverlay &&' frontend/src/App.jsx
    Expected: >= 1
    Evidence: .omo/evidence/task-6-conditional-render.txt
  ```

  **Commit**: YES | Message: `fix: integrate useScreenState, conditional rendering, and ErrorBoundary into App` | Files: `frontend/src/App.jsx`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
- [ ] F1. Plan Compliance Audit — verify every acceptance criterion in every task is met. Check file contents, imports, exports, CSS classes, hook signatures. Use `Bash` grep commands and `Read` on all changed files.
- [ ] F2. Build Verification — `cd frontend && npm run build` passes without errors
- [ ] F3. Logic Review — manually trace the overlay lifecycle:
  1. When overlay is visible (class time): content NOT rendered, page rotation paused, breathing indicator animates
  2. When break starts: overlay fades out (800ms CSS transition), content renders, page rotation resumes
  3. When error occurs in content: ErrorBoundary catches, overlay unaffected
  4. After 60s data refresh: useScreenState refs stay current, no stale timetable data
- [ ] F4. Duplicate Timer Check — confirm `TimetablePage.jsx` no longer imports `useBoardClock`, eliminating the second 1s interval

## Commit Strategy
| # | Message | Files |
|---|---------|-------|
| 1 | `feat: add useScreenState hook for isolated overlay state` | `frontend/src/board/hooks/useScreenState.js` |
| 2 | `feat: add ErrorBoundary component for render crash recovery` | `frontend/src/board/components/ErrorBoundary.jsx` |
| 3 | `feat: add overlay CSS transitions and breathing indicator` | `frontend/src/index.css` |
| 4 | `fix: add pause support to usePageRotation for overlay state` | `frontend/src/board/hooks/usePageRotation.js` |
| 5 | `fix: remove duplicate useBoardClock from TimetablePage` | `frontend/src/board/components/TimetablePage.jsx` |
| 6 | `fix: integrate useScreenState, conditional rendering, and ErrorBoundary into App` | `frontend/src/App.jsx` |

## Success Criteria
1. Overlay reliably hides when class→break transition occurs (even after extended runtime)
2. Overlay reliably shows when break→class transition occurs
3. Browser compositor does not deprioritize the tab (breathing indicator ensures continuous repaints)
4. Page rotation stops during overlay (no wasted CPU/battery)
5. Content is not rendered during overlay (no wasted rendering)
6. Render errors in content components do not break the overlay
7. No duplicate clock intervals running
8. `npm run build` succeeds
