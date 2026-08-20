import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

interface ValueRange {
  values?: string[][]
}

export function createGoogleSheetsTools(auth: GoogleAuthManager): ToolDefinition[] {
  const readSheetRangeTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'read_sheet_range',
      description: 'Reads cell values from a range in a Google Sheet (e.g. "Sheet1!A1:C10").',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
          range: { type: 'string', description: 'A1-notation range, e.g. "Sheet1!A1:C10"' }
        },
        required: ['spreadsheetId', 'range']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const url = `${SHEETS_BASE}/${encodeURIComponent(String(args.spreadsheetId ?? ''))}/values/${encodeURIComponent(String(args.range ?? ''))}`
        const result = await googleFetchJson<ValueRange>(url, auth, undefined, signal)
        const rows = result.values ?? []
        if (!rows.length) return 'That range is empty.'
        return `Rows: ${rows.map((row) => row.join(', ')).join(' | ')}.`
      })
    }
  }

  const appendSheetRowTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'append_sheet_row',
      description: 'Appends a new row to a Google Sheet.',
      parameters: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
          range: { type: 'string', description: 'A1-notation range identifying the target sheet/table, e.g. "Sheet1!A1"' },
          // ToolSchema properties don't support array types, so multiple
          // cell values come in as one comma-separated string and get split
          // here -- same tradeoff as any other tool that needs a list.
          values: { type: 'string', description: 'Comma-separated cell values for the new row, e.g. "2026-08-20, groceries, 42.50"' }
        },
        required: ['spreadsheetId', 'range', 'values']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const values = String(args.values ?? '')
          .split(',')
          .map((v) => v.trim())
        const url = `${SHEETS_BASE}/${encodeURIComponent(String(args.spreadsheetId ?? ''))}/values/${encodeURIComponent(String(args.range ?? ''))}:append?valueInputOption=USER_ENTERED`
        await googleFetchJson(
          url,
          auth,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [values] }) },
          signal
        )
        return 'Row added.'
      })
    }
  }

  return [readSheetRangeTool, appendSheetRowTool]
}
