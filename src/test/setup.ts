import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Provide stub env vars so @/lib/supabase doesn't throw when imported in tests.
// Tests that need to assert calls on the supabase client should mock it explicitly.
import.meta.env.VITE_SUPABASE_URL ??= 'http://localhost:54321'
import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key'

// Radix Slider/Dialog use ResizeObserver, absent in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// Radix Dialog uses pointer-capture APIs, absent in jsdom.
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn()
}
