import { describe, it, expect, vi } from 'vitest'

const hideOverlay = vi.fn()
const showOverlay = vi.fn()
vi.mock('../overlay/overlayWindow', () => ({ hideOverlay, showOverlay }))

const { hideOverlayTool, showOverlayTool } = await import('./overlayControl')

describe('overlayControl tools', () => {
  it('hide_overlay calls hideOverlay() and reports it kept listening', async () => {
    const result = await hideOverlayTool.execute({})
    expect(hideOverlay).toHaveBeenCalledOnce()
    expect(result).toMatch(/hidden/i)
    expect(result).toMatch(/listening/i)
  })

  it('show_overlay calls showOverlay()', async () => {
    const result = await showOverlayTool.execute({})
    expect(showOverlay).toHaveBeenCalledOnce()
    expect(result).toMatch(/shown/i)
  })

  it('neither tool is risky and both take no arguments', () => {
    for (const tool of [hideOverlayTool, showOverlayTool]) {
      expect(tool.risky).toBe(false)
      expect(tool.schema.parameters.required).toEqual([])
    }
  })
})
