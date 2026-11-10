export interface SplashFrameBounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface SplashFrameInput {
  readonly canvas: { readonly width: number; readonly height: number }
  readonly image: { readonly width: number; readonly height: number }
  /** Face and torso in normalized source-image coordinates. */
  readonly focus: SplashFrameBounds
  /** The unobstructed region, including its safety margin, in local canvas pixels. */
  readonly available: SplashFrameBounds
  /** The authored background position, from 0 (left/top) to 1 (right/bottom). */
  readonly preferredPosition?: { readonly x: number; readonly y: number }
}

export interface SplashFrameResult {
  /** A cover background can pan only within the source pixels outside the canvas. */
  readonly position: { readonly x: number; readonly y: number }
  readonly renderedImage: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  readonly focus: SplashFrameBounds
  /** A source-composition issue must not be hidden by shrinking the whole painting. */
  readonly focusFits: boolean
}

const finite = (...values: number[]) => values.every(Number.isFinite)
const validBounds = (bounds: SplashFrameBounds) => finite(bounds.left, bounds.top, bounds.right, bounds.bottom)
  && bounds.right > bounds.left && bounds.bottom > bounds.top
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum)

/**
 * Position one crisp, full-canvas painting. At 16:9 its complete source is visible;
 * other aspect ratios use the natural cover crop, with bounded panning to protect
 * the painted face. Never zoom out, transform the canvas, or expose empty edges.
 * If the authored focus cannot fit, expose that source-art constraint to QA.
 */
export function fitSplashFrame(input: SplashFrameInput): SplashFrameResult | null {
  const { canvas, image, focus, available, preferredPosition = { x: .5, y: .5 } } = input
  if (!finite(canvas.width, canvas.height, image.width, image.height, preferredPosition.x, preferredPosition.y)
    || canvas.width <= 0 || canvas.height <= 0 || image.width <= 0 || image.height <= 0
    || preferredPosition.x < 0 || preferredPosition.x > 1 || preferredPosition.y < 0 || preferredPosition.y > 1
    || !validBounds(focus) || focus.left < 0 || focus.top < 0 || focus.right > 1 || focus.bottom > 1
    || !validBounds(available) || available.left < 0 || available.top < 0
    || available.right > canvas.width || available.bottom > canvas.height) return null

  const coverScale = Math.max(canvas.width / image.width, canvas.height / image.height)
  const width = image.width * coverScale, height = image.height * coverScale
  const positionAxis = (canvasSize: number, imageSize: number, start: number, end: number, minimum: number, maximum: number, preferred: number) => {
    const minimumOffset = canvasSize - imageSize
    const preferredOffset = minimumOffset * preferred
    const fitMinimum = Math.max(minimumOffset, minimum - start * imageSize)
    const fitMaximum = Math.min(0, maximum - end * imageSize)
    // When the source is too wide/tall for the opening, keep its center nearest
    // the opening rather than silently reducing the entire environment.
    return fitMinimum <= fitMaximum
      ? clamp(preferredOffset, fitMinimum, fitMaximum)
      : clamp((minimum + maximum - (start + end) * imageSize) / 2, minimumOffset, 0)
  }
  const left = positionAxis(canvas.width, width, focus.left, focus.right, available.left, available.right, preferredPosition.x)
  const top = positionAxis(canvas.height, height, focus.top, focus.bottom, available.top, available.bottom, preferredPosition.y)
  const projected = {
    left: left + focus.left * width, right: left + focus.right * width,
    top: top + focus.top * height, bottom: top + focus.bottom * height,
  }
  return {
    position: {
      x: width > canvas.width ? left / (canvas.width - width) : .5,
      y: height > canvas.height ? top / (canvas.height - height) : .5,
    },
    renderedImage: { left, top, width, height },
    focus: projected,
    // Match browser QA's one-pixel allowance for fractional CSS layout. The
    // opening already includes a14–22px safety margin around the real panels.
    focusFits: projected.left >= available.left - 1 && projected.right <= available.right + 1
      && projected.top >= available.top - 1 && projected.bottom <= available.bottom + 1,
  }
}
