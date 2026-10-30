import { useEffect } from 'react'
import type { MascotContent } from '../types'
import { imageFor } from '../utils/mascot'

/**
 * After the content has loaded, fetch every picture once in the background, so changing faces (waiting,
 * cheering, resting) shows at once instead of flickering while the next picture downloads.
 */
export function usePreloadMascotImages(content: MascotContent): void {
  useEffect(() => {
    // Each Image is only created to make the browser download and cache the picture. Nothing is stored:
    // once it is cached, the real <img> shows it instantly.
    for (const key of Object.keys(content.images)) {
      const picture = imageFor(content, key)
      if (picture) new Image().src = picture.url
    }
  }, [content])
}
