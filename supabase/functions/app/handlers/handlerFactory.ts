import type { IRequest, RequestHandler } from '../../../../lib/dispatch/dispatch.ts'
import type { AppRequestIdentifier } from '../../../../common/appRequestIdentifiers.ts'
import type { AppInvocationContext } from '../types/context.ts'

type AppRequestHandlerFactory = {
  (context: AppInvocationContext): RequestHandler
  requestIdentifier: AppRequestIdentifier
}

export const createAppRequestHandlerFactory = (
  requestIdentifier: AppRequestIdentifier,
  createHandler: (context: AppInvocationContext) => (request: IRequest<unknown, unknown>) => unknown | Promise<unknown>
) => Object.assign(
  (context: AppInvocationContext) => createHandler(context),
  { requestIdentifier }
) satisfies AppRequestHandlerFactory
