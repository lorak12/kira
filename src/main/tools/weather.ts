import type { ToolDefinition } from './types'
import { fetchJson } from './http'

// Open-Meteo: free, no API key required.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

// WMO weather interpretation codes, as used by Open-Meteo.
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  56: 'light freezing drizzle',
  57: 'dense freezing drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  66: 'light freezing rain',
  67: 'heavy freezing rain',
  71: 'slight snow fall',
  73: 'moderate snow fall',
  75: 'heavy snow fall',
  77: 'snow grains',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'slight snow showers',
  86: 'heavy snow showers',
  95: 'a thunderstorm',
  96: 'a thunderstorm with slight hail',
  99: 'a thunderstorm with heavy hail'
}

/** Maps a WMO weather code to a spoken-friendly description. Pure/testable. */
export function describeWeatherCode(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? 'unusual conditions'
}

interface GeocodeResult {
  results?: { name: string; latitude: number; longitude: number; country?: string }[]
}

interface ForecastResult {
  current: { temperature_2m: number; wind_speed_10m: number; weather_code: number }
}

export class WeatherError extends Error {}

export async function geocodeLocation(
  location: string,
  signal?: AbortSignal
): Promise<{ name: string; lat: number; lon: number }> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=1`
  const data = await fetchJson<GeocodeResult>(url, signal)
  const match = data.results?.[0]
  if (!match) throw new WeatherError(`Couldn't find a location called "${location}".`)
  return { name: match.name, lat: match.latitude, lon: match.longitude }
}

export async function fetchForecast(
  lat: number,
  lon: number,
  unit: 'celsius' | 'fahrenheit',
  signal?: AbortSignal
): Promise<ForecastResult> {
  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${unit}`
  return fetchJson<ForecastResult>(url, signal)
}

export const weatherTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'get_weather',
    description: 'Gets the current weather for a location (city name).',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, e.g. "Warsaw" or "New York"' },
        unit: { type: 'string', description: 'Temperature unit', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  },
  async execute(args, signal) {
    const location = String(args.location ?? '')
    const unit = args.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'
    try {
      const place = await geocodeLocation(location, signal)
      const forecast = await fetchForecast(place.lat, place.lon, unit, signal)
      const { temperature_2m, wind_speed_10m, weather_code } = forecast.current
      const symbol = unit === 'fahrenheit' ? '°F' : '°C'
      return `It's ${Math.round(temperature_2m)}${symbol} and ${describeWeatherCode(weather_code)} in ${place.name}, with wind at ${Math.round(wind_speed_10m)} km/h.`
    } catch (err) {
      return `Couldn't get the weather: ${(err as Error).message}`
    }
  }
}
