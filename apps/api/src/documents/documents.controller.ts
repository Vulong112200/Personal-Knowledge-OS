import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { DocumentsService, MAX_SIZE_BYTES } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  upload(@CurrentUser() user: CurrentUserPayload, @UploadedFile() file: Express.Multer.File) {
    return this.documents.upload(user, file);
  }

  // Declared before the ':id' routes so the static 'notes' segment isn't shadowed.
  @Post('notes')
  createNote(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    return this.documents.createNote(user, body);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query('tag') tag?: string) {
    return this.documents.list(user, tag);
  }

  @Patch(':id')
  updateNote(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.documents.updateNote(user, id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.get(user, id);
  }

  @Get(':id/content')
  getContent(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.getContent(user, id);
  }

  @Post(':id/reprocess')
  reprocess(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.reprocess(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.remove(user, id);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { filename, mimeType, buffer } = await this.documents.download(user, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
