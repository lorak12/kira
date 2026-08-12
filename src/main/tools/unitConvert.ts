import type { ToolDefinition } from './types'

export class UnitConvertError extends Error {}

// Each group converts through a common base unit (SI where applicable).
// Temperature is the odd one out (affine, not linear), handled separately.
const LENGTH: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  inch: 0.0254,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  yd: 0.9144,
  yard: 0.9144,
  mi: 1609.344,
  mile: 1609.344
}

const WEIGHT: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  oz: 28.349523125,
  ounce: 28.349523125,
  ton: 1_000_000,
  tonne: 1_000_000
}

const VOLUME: Record<string, number> = {
  ml: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  gal: 3785.411784,
  gallon: 3785.411784,
  cup: 236.5882365,
  tbsp: 14.78676478125,
  tsp: 4.92892159375,
  floz: 29.5735295625
}

// Accept plain plurals ("miles", "cups", "kilometers" written as "km"s
// alias etc.) without hand-listing every one.
function withPlurals(group: Record<string, number>): Record<string, number> {
  const result = { ...group }
  for (const [unit, factor] of Object.entries(group)) {
    if (unit.length > 1 && !unit.endsWith('s') && !(`${unit}s` in result)) {
      result[`${unit}s`] = factor
    }
  }
  return result
}

const GROUPS: Record<string, number>[] = [withPlurals(LENGTH), withPlurals(WEIGHT), withPlurals(VOLUME)]

function normalize(unit: string): string {
  return unit.trim().toLowerCase()
}

function convertTemperature(value: number, from: string, to: string): number {
  const toCelsius: Record<string, (v: number) => number> = {
    c: (v) => v,
    celsius: (v) => v,
    f: (v) => ((v - 32) * 5) / 9,
    fahrenheit: (v) => ((v - 32) * 5) / 9,
    k: (v) => v - 273.15,
    kelvin: (v) => v - 273.15
  }
  const fromCelsius: Record<string, (v: number) => number> = {
    c: (v) => v,
    celsius: (v) => v,
    f: (v) => (v * 9) / 5 + 32,
    fahrenheit: (v) => (v * 9) / 5 + 32,
    k: (v) => v + 273.15,
    kelvin: (v) => v + 273.15
  }
  if (!(from in toCelsius) || !(to in fromCelsius)) {
    throw new UnitConvertError(`Unknown temperature unit "${!(from in toCelsius) ? from : to}".`)
  }
  return fromCelsius[to](toCelsius[from](value))
}

/** Converts a value between compatible units. Throws UnitConvertError if the units are unknown or incompatible. */
export function convertUnits(value: number, fromUnit: string, toUnit: string): number {
  const from = normalize(fromUnit)
  const to = normalize(toUnit)

  const isTemp = ['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin'].includes(from)
  if (isTemp) return convertTemperature(value, from, to)

  const group = GROUPS.find((g) => from in g)
  if (!group) throw new UnitConvertError(`Unknown unit "${fromUnit}".`)
  if (!(to in group)) {
    throw new UnitConvertError(`Cannot convert "${fromUnit}" to "${toUnit}" -- incompatible units.`)
  }
  const base = value * group[from]
  return base / group[to]
}

export const unitConvertTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'convert_units',
    description:
      'Converts a numeric value between units of length (mm/cm/m/km/in/ft/yd/mi), weight (mg/g/kg/lb/oz/ton), volume (ml/l/gal/cup/tbsp/tsp/floz), or temperature (c/f/k).',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'The numeric value to convert' },
        fromUnit: { type: 'string', description: 'The unit to convert from, e.g. "km" or "fahrenheit"' },
        toUnit: { type: 'string', description: 'The unit to convert to, e.g. "mi" or "celsius"' }
      },
      required: ['value', 'fromUnit', 'toUnit']
    }
  },
  async execute(args) {
    const value = Number(args.value)
    const fromUnit = String(args.fromUnit ?? '')
    const toUnit = String(args.toUnit ?? '')
    if (!Number.isFinite(value)) return `"${args.value}" is not a valid number.`
    try {
      const result = convertUnits(value, fromUnit, toUnit)
      const rounded = Math.round(result * 1e6) / 1e6
      return `${value} ${fromUnit} = ${rounded} ${toUnit}`
    } catch (err) {
      return `Could not convert: ${(err as Error).message}`
    }
  }
}
