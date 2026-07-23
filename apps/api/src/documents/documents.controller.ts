import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
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

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.documents.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.get(user, id);
  }

  @Get(':id/content')
  getContent(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documents.getContent(user, id);
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
    const { document, buffer } = await this.documents.download(user, id);
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalFilename}"`);
    res.send(buffer);
  }
}
