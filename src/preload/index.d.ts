import type { KiraApi } from './index'

declare global {
  interface Window {
    kira: KiraApi
  }
}
