import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { chooseCtaMode, type CtaMode } from '../utils/ctaMode'

/** The bottom safe-area inset (the iPhone home indicator) in pixels, read from the browser. 0 where there is none. */
function readSafeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom, 0px)'
  document.body.appendChild(probe)
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom)
  probe.remove()
  return Number.isFinite(value) ? value : 0
}

/** The box's real height as it would be drawn in `mode`. */
function heightIn(box: HTMLElement, mode: CtaMode): number {
  box.setAttribute('data-mode', mode)
  return box.getBoundingClientRect().height
}

/**
 * Decides how the landing page's sign-in box is shown (see utils/ctaMode.ts) from what is really on screen:
 *   - the VISIBLE viewport height (`visualViewport`, which excludes the browser toolbars and the keyboard),
 *     not the screen's height;
 *   - the box's own height in full and in compact mode, measured from the rendered box (so a longer Terms
 *     text, or an error message inside it, is counted);
 *   - the height of the carousel block, from its heading to the bottom of its dots (0 when there is none).
 *
 * The decision is made in a layout effect, before the browser paints, so there is no flash of the wrong mode.
 * It is made again on resize, rotation, a change of the visible viewport, when the fonts finish loading, and
 * whenever the box or the carousel block changes size.
 *
 * Use the two returned refs on the box and on the carousel's outer element.
 */
export function useCtaMode(): {
  mode: CtaMode
  boxRef: (element: HTMLElement | null) => void
  carouselRef: (element: HTMLElement | null) => void
} {
  const [mode, setMode] = useState<CtaMode>('static')
  const box = useRef<HTMLElement | null>(null)
  const carousel = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const previous = useRef<CtaMode | null>(null)

  const decide = useCallback(() => {
    const element = box.current
    if (!element) return

    // The box is measured in both modes by switching its mode attribute for a moment and switching it back,
    // all in one go, so nothing is ever painted in between.
    const shown = element.getAttribute('data-mode')
    const boxFullH = heightIn(element, 'full')
    const boxCompactH = heightIn(element, 'compact')
    if (shown) element.setAttribute('data-mode', shown)

    const viewport = window.visualViewport
    const viewportH = viewport?.height ?? window.innerHeight
    const viewportW = viewport?.width ?? window.innerWidth

    const next = chooseCtaMode({
      viewportH,
      boxFullH,
      boxCompactH,
      carouselBlockH: carousel.current?.getBoundingClientRect().height ?? 0,
      safeBottom: readSafeBottom(),
      prevMode: previous.current,
      isLandscape: viewportW > viewportH,
    })
    previous.current = next
    setMode(next)
  }, [])

  // Callback refs, so the decision is also made when the box or the carousel appears (the carousel's content
  // can arrive after the page opened) and so each one is watched for size changes while it exists.
  const boxRef = useCallback(
    (element: HTMLElement | null) => {
      if (box.current) observer.current?.unobserve(box.current)
      box.current = element
      if (element) {
        observer.current?.observe(element)
        decide()
      }
    },
    [decide],
  )
  const carouselRef = useCallback(
    (element: HTMLElement | null) => {
      if (carousel.current) observer.current?.unobserve(carousel.current)
      carousel.current = element
      if (element) observer.current?.observe(element)
      // Appearing or disappearing changes the room needed; decide again.
      decide()
    },
    [decide],
  )

  useLayoutEffect(() => {
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(() => decide())
      if (box.current) observer.current.observe(box.current)
      if (carousel.current) observer.current.observe(carousel.current)
    }

    window.addEventListener('resize', decide)
    window.addEventListener('orientationchange', decide)
    window.visualViewport?.addEventListener('resize', decide)
    // Text takes other room once the web fonts arrive.
    const fonts = document.fonts
    void fonts?.ready.then(decide)
    fonts?.addEventListener?.('loadingdone', decide)

    decide()
    return () => {
      observer.current?.disconnect()
      observer.current = null
      window.removeEventListener('resize', decide)
      window.removeEventListener('orientationchange', decide)
      window.visualViewport?.removeEventListener('resize', decide)
      fonts?.removeEventListener?.('loadingdone', decide)
    }
  }, [decide])

  return { mode, boxRef, carouselRef }
}
