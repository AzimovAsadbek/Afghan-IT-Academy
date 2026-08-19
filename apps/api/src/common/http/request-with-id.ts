import type { Request } from 'express';

/**
 * An Express request after `RequestIdMiddleware` has run.
 *
 * Declared as an explicit interface rather than a global `declare module`
 * augmentation of express-serve-static-core: global augmentation makes every
 * request in the codebase *look* like it has an id, including the ones on
 * routes the middleware never touched. Naming the type keeps the guarantee
 * honest and visible at each use site.
 */
export interface RequestWithId extends Request {
  readonly requestId: string;
}
