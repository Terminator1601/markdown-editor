// Logger utility for API routes
export const createLogger = (apiName: string) => {
  return {
    info: (message: string, data?: any) => {
      console.log(`[${apiName}] ${new Date().toISOString()} - INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '')
    },
    error: (message: string, error?: any) => {
      console.error(`[${apiName}] ${new Date().toISOString()} - ERROR: ${message}`, error)
    },
    warn: (message: string, data?: any) => {
      console.warn(`[${apiName}] ${new Date().toISOString()} - WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '')
    },
    debug: (message: string, data?: any) => {
      console.debug(`[${apiName}] ${new Date().toISOString()} - DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '')
    }
  }
}