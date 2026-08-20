import type { ToolDefinition } from './types'
import type { KiraConfig } from '../config/schema'
import { fetchJson } from './http'

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json'

export type TravelMode = 'driving' | 'walking' | 'transit' | 'bicycling'

interface DirectionsLeg {
  duration?: { text: string }
  distance?: { text: string }
}

interface DirectionsRoute {
  summary?: string
  legs?: DirectionsLeg[]
}

interface DirectionsResponse {
  status: string
  routes?: DirectionsRoute[]
  error_message?: string
}

/** Formats a directions API response into a spoken-friendly summary. Pure/testable. */
export function formatDirections(response: DirectionsResponse, mode: TravelMode): string {
  if (response.status !== 'OK') {
    if (response.status === 'ZERO_RESULTS') return `Couldn't find a ${mode} route between those two places.`
    return `Couldn't get directions: ${response.error_message ?? response.status}.`
  }
  const route = response.routes?.[0]
  const leg = route?.legs?.[0]
  if (!leg?.duration || !leg?.distance) return "Couldn't get directions for that route."

  const verb: Record<TravelMode, string> = {
    driving: 'driving',
    walking: 'walking',
    transit: 'by public transport',
    bicycling: 'cycling'
  }
  return `About ${leg.duration.text} (${leg.distance.text}) ${verb[mode]}${route?.summary ? ` via ${route.summary}` : ''}.`
}

export function createDirectionsTool(config: KiraConfig): ToolDefinition {
  return {
    risky: false,
    schema: {
      name: 'get_directions',
      description: 'Gets travel time and distance between two places via Google Maps, for driving, walking, public transport, or cycling.',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string', description: 'Starting address or place name' },
          destination: { type: 'string', description: 'Destination address or place name' },
          mode: { type: 'string', description: 'Mode of travel', enum: ['driving', 'walking', 'transit', 'bicycling'] }
        },
        required: ['origin', 'destination']
      }
    },
    async execute(args, signal) {
      const apiKey = config.maps.apiKey
      if (!apiKey) return "Google Maps isn't configured -- add maps.apiKey to kira.config.json."

      const mode = (['driving', 'walking', 'transit', 'bicycling'].includes(String(args.mode)) ? args.mode : 'driving') as TravelMode
      const params = new URLSearchParams({
        origin: String(args.origin ?? ''),
        destination: String(args.destination ?? ''),
        mode,
        key: apiKey
      })
      try {
        const response = await fetchJson<DirectionsResponse>(`${DIRECTIONS_URL}?${params}`, signal)
        return formatDirections(response, mode)
      } catch (err) {
        return `Couldn't get directions: ${(err as Error).message}`
      }
    }
  }
}
