import { createDispatcher, type IRequest } from '../../../lib/dispatch/dispatch.ts'
import { withSupabase } from 'npm:@supabase/server@^1'
import { HttpError, errorMessage } from './helpers.ts'
import { createAppRequestHandlers } from './handlers/index.ts'

type AppFunctionRequest = {
  identifier?: string
  params?: unknown
}

const parseAppRequest = async (request: Request): Promise<IRequest<unknown, unknown>> => {
  const body = await request.json() as AppFunctionRequest

  if (!body.identifier) {
    throw new HttpError(400, 'Request identifier is required.')
  }

  return {
    identifier: body.identifier,
    params: body.params
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    try {
      const { data, error } = await context.supabase.auth.getUser()

      if (error || !data.user) {
        throw new HttpError(401, 'Sign in before using the app.')
      }

      const dispatcher = createDispatcher(createAppRequestHandlers({
        client: context.supabase,
        user: data.user
      }))
      const appRequest = await parseAppRequest(request)

      return Response.json(await dispatcher.dispatch(appRequest))
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 400

      return Response.json({ error: errorMessage(error) }, { status })
    }
  })
}
