export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Something went wrong.'
)

export const cleanString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
)

export const cleanStringArray = (value: unknown) => (
  Array.isArray(value)
    ? [...new Set(value.map(cleanString).filter(Boolean))]
    : []
)

export const cleanPositiveInteger = (value: unknown, fallback: number) => {
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return fallback
  }

  return numberValue
}
