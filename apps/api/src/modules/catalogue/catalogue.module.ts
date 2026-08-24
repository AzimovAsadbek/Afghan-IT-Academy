import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/index.js';
import { CourseController } from './course.controller.js';
import { CourseService } from './course.service.js';

/**
 * Course discovery.
 *
 * Read-only for now. Authoring lands with the instructor platform; keeping the
 * write side out until something actually creates a course avoids freezing an
 * editing model nothing has been built against.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CatalogueModule {}
