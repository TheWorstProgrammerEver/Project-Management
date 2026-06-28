export type AuthenticationType = 'emailPassword' | 'magicLink' | 'otp'

export type SupportedAuthenticationTypes = Record<AuthenticationType, boolean>

const authenticationTypeOrder: AuthenticationType[] = ['emailPassword', 'otp', 'magicLink']

export const getEnabledAuthenticationTypes = (supportedTypes: SupportedAuthenticationTypes) => (
  authenticationTypeOrder.filter((type) => supportedTypes[type])
)

export const getDefaultAuthenticationType = (supportedTypes: SupportedAuthenticationTypes) => (
  getEnabledAuthenticationTypes(supportedTypes)[0] ?? 'emailPassword'
)
