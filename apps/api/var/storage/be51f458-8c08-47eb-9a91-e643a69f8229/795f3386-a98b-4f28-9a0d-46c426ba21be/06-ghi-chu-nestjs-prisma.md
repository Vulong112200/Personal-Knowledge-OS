# Ghi chu ca nhan ve NestJS va Prisma

Hom nay tim hieu sau hon ve cach NestJS ket hop voi Prisma trong mot du an thuc te.

## Vi sao chon NestJS

NestJS cung cap dependency injection va cau truc module ro rang, giup du an de
bao tri khi quy mo lon dan. Moi feature co the tach thanh mot module rieng, chi
expose ra nhung gi can thiet.

## Vi sao chon Prisma

Prisma giup viet truy van database an toan ve kieu du lieu (type-safe), tu dong
sinh ra client dua tren schema. Prisma v7 doi sang kien truc driver-adapter, nen
can cai them adapter (vi du @prisma/adapter-pg cho Postgres) thay vi dung engine
nhi phan co san.

## Ket hop NestJS va Prisma

Cach pho bien la boc PrismaClient trong mot PrismaService, dang ky la provider
trong module, roi inject vao cac service khac qua dependency injection token.
Cach nay giup de dang thay the adapter sau nay ma khong anh huong code goi no.
