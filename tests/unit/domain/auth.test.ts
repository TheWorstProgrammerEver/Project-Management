import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getDefaultAuthenticationType,
  getEnabledAuthenticationTypes,
  getSupportedAuthenticationTypes
} from '../../../src/domain/auth'

describe('auth config helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to email password auth', () => {
    expect(getSupportedAuthenticationTypes()).toEqual({
      emailPassword: true,
      magicLink: false,
      otp: false
    })
  })

  it('keeps a stable enabled method order', () => {
    vi.stubGlobal('window', {
      config: {
        auth: {
          supportedTypes: {
            emailPassword: false,
            magicLink: true,
            otp: true
          }
        }
      }
    })

    const supportedTypes = getSupportedAuthenticationTypes()

    expect(getEnabledAuthenticationTypes(supportedTypes)).toEqual(['otp', 'magicLink'])
    expect(getDefaultAuthenticationType(supportedTypes)).toBe('otp')
  })
})
