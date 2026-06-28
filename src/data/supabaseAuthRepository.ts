import type { Session, User } from '@supabase/supabase-js'
import { nameFromEmail, normalizeEmail } from '../domain/people'
import type { Account } from '../types/auth'
import { supabase } from './supabaseClient'

type AuthCredentials = {
  email: string
  password: string
}

type SignUpCredentials = AuthCredentials & {
  name: string
}

type EmailOnlyCredentials = {
  email: string
  name: string
}

type OtpCredentials = EmailOnlyCredentials & {
  token: string
}

const metadataName = (user: User) => {
  const displayName = user.user_metadata?.display_name

  return typeof displayName === 'string' ? displayName.trim() : ''
}

const accountFromUser = (user: User, preferredName?: string): Account => ({
  id: user.id,
  email: normalizeEmail(user.email ?? ''),
  name: preferredName?.trim() || metadataName(user) || nameFromEmail(user.email ?? ''),
  createdDate: user.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
})

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export const onAuthSessionChange = (onChange: (session: Session | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onChange(session))

  return () => data.subscription.unsubscribe()
}

export const getAccountForUser = async (user: User, preferredName?: string): Promise<Account> => {
  return accountFromUser(user, preferredName)
}

export const signInWithPassword = async ({ email, password }: AuthCredentials) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password
  })

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error('Supabase did not return a signed-in user.')
  }

  return getAccountForUser(data.user)
}

export const signUpWithPassword = async ({ email, name, password }: SignUpCredentials) => {
  const normalizedEmail = normalizeEmail(email)
  const displayName = name.trim() || nameFromEmail(normalizedEmail)
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        display_name: displayName
      },
      emailRedirectTo: window.location.origin
    }
  })

  if (error) {
    throw error
  }

  if (!data.user || !data.session) {
    throw new Error('Check your email to finish creating your account, then sign in.')
  }

  return getAccountForUser(data.user, displayName)
}

export const requestOneTimePassword = async ({ email, name }: EmailOnlyCredentials) => {
  const normalizedEmail = normalizeEmail(email)
  const displayName = name.trim() || nameFromEmail(normalizedEmail)
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      data: {
        display_name: displayName
      },
      shouldCreateUser: true
    }
  })

  if (error) {
    throw error
  }
}

export const verifyOneTimePassword = async ({ email, name, token }: OtpCredentials) => {
  const normalizedEmail = normalizeEmail(email)
  const displayName = name.trim() || nameFromEmail(normalizedEmail)
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: token.trim(),
    type: 'email'
  })

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error('Supabase did not return a signed-in user.')
  }

  return getAccountForUser(data.user, displayName)
}

export const sendMagicLink = async ({ email, name }: EmailOnlyCredentials) => {
  const normalizedEmail = normalizeEmail(email)
  const displayName = name.trim() || nameFromEmail(normalizedEmail)
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      data: {
        display_name: displayName
      },
      emailRedirectTo: window.location.origin,
      shouldCreateUser: true
    }
  })

  if (error) {
    throw error
  }
}

export const signOutOfSupabase = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
