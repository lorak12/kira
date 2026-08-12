import { describe, it, expect, vi } from 'vitest'
import { fetchJson } from './http'
import { describeWeatherCode, geocodeLocation, WeatherError, weatherTool } from './weather'

vi.mock('./http', () => ({ fetchJson: vi.fn() }))

describe('describeWeatherCode', () => {
  it('maps known WMO codes', () => {
    expect(describeWeatherCode(0)).toBe('clear sky')
    expect(describeWeatherCode(95)).toBe('a thunderstorm')
  })

  it('falls back gracefully for unknown codes', () => {
    expect(describeWeatherCode(9999)).toBe('unusual conditions')
  })
})

describe('geocodeLocation', () => {
  it('resolves a matching location', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      results: [{ name: 'Warsaw', latitude: 52.23, longitude: 21.01, country: 'Poland' }]
    })
    const result = await geocodeLocation('Warsaw')
    expect(result).toEqual({ name: 'Warsaw', lat: 52.23, lon: 21.01 })
  })

  it('throws WeatherError when nothing matches', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ results: [] })
    await expect(geocodeLocation('Nowheresville')).rejects.toThrow(WeatherError)
  })
})

describe('weatherTool.execute', () => {
  it('reports temperature, conditions, and wind for a location', async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ results: [{ name: 'Warsaw', latitude: 52.23, longitude: 21.01 }] })
      .mockResolvedValueOnce({ current: { temperature_2m: 21.4, wind_speed_10m: 12.3, weather_code: 3 } })
    const result = await weatherTool.execute({ location: 'Warsaw' })
    expect(result).toBe("It's 21°C and overcast in Warsaw, with wind at 12 km/h.")
  })

  it('honors the fahrenheit unit', async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ results: [{ name: 'NYC', latitude: 40.7, longitude: -74 }] })
      .mockResolvedValueOnce({ current: { temperature_2m: 70, wind_speed_10m: 5, weather_code: 0 } })
    const result = await weatherTool.execute({ location: 'NYC', unit: 'fahrenheit' })
    expect(result).toContain('70°F')
  })

  it('returns a friendly error when the location cannot be found', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ results: [] })
    const result = await weatherTool.execute({ location: 'Nowheresville' })
    expect(result).toContain("Couldn't get the weather")
  })
})
