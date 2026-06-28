import { createDispatcher, createRequestHandlers } from '../../../lib/dispatch/dispatch'
import { createSupabaseFunctionInvokerRequestHandler } from '../supabaseFunctionInvokerRequestHandler'
import { supabase } from '../supabaseClient'
import { appRequestTypes } from './requests'

const appFunctionInvoker = createSupabaseFunctionInvokerRequestHandler(supabase, 'app')

const handlers = createRequestHandlers(appRequestTypes.map((requestType) => ({
  identifier: requestType.identifier,
  handler: appFunctionInvoker
})))

export const appDispatcher = createDispatcher(handlers)
