import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';

/**
 * The security record. Every domain writes here; none owns it.
 *
 * Global because an audit call belongs wherever the security-relevant action
 * happens, and threading an import through every future module would make the
 * cheap thing awkward and the awkward thing skipped.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
