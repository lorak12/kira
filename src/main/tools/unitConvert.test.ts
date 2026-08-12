import { describe, it, expect } from 'vitest'
import { convertUnits, UnitConvertError, unitConvertTool } from './unitConvert'

describe('convertUnits', () => {
  it('converts length', () => {
    expect(convertUnits(1, 'km', 'm')).toBe(1000)
    expect(convertUnits(1, 'mile', 'km')).toBeCloseTo(1.609344, 5)
  })

  it('converts weight', () => {
    expect(convertUnits(1, 'kg', 'g')).toBe(1000)
    expect(convertUnits(1, 'lb', 'kg')).toBeCloseTo(0.453592, 5)
  })

  it('converts volume', () => {
    expect(convertUnits(1, 'l', 'ml')).toBe(1000)
    expect(convertUnits(1, 'gallon', 'l')).toBeCloseTo(3.785412, 5)
  })

  it('accepts plain plurals', () => {
    expect(convertUnits(2, 'miles', 'km')).toBeCloseTo(3.218688, 5)
    expect(convertUnits(3, 'cups', 'ml')).toBeCloseTo(709.76, 1)
  })

  it('converts temperature (affine, not linear)', () => {
    expect(convertUnits(0, 'celsius', 'fahrenheit')).toBe(32)
    expect(convertUnits(212, 'f', 'c')).toBeCloseTo(100, 5)
    expect(convertUnits(0, 'c', 'kelvin')).toBeCloseTo(273.15, 5)
  })

  it('throws on unknown units', () => {
    expect(() => convertUnits(1, 'banana', 'm')).toThrow(UnitConvertError)
  })

  it('throws on incompatible units', () => {
    expect(() => convertUnits(1, 'kg', 'm')).toThrow(UnitConvertError)
  })
})

describe('unitConvertTool.execute', () => {
  it('returns a friendly result string', async () => {
    const result = await unitConvertTool.execute({ value: 1, fromUnit: 'km', toUnit: 'm' })
    expect(result).toBe('1 km = 1000 m')
  })

  it('rejects a non-numeric value without throwing', async () => {
    const result = await unitConvertTool.execute({ value: 'abc', fromUnit: 'km', toUnit: 'm' })
    expect(result).toContain('not a valid number')
  })

  it('returns a friendly error for incompatible units', async () => {
    const result = await unitConvertTool.execute({ value: 1, fromUnit: 'kg', toUnit: 'm' })
    expect(result).toContain('Could not convert')
  })
})
