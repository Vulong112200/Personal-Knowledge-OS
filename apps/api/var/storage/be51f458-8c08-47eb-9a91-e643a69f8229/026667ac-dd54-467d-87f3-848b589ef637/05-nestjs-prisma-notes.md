# NestJS and Prisma Integration Notes

NestJS is a progressive Node.js framework built with TypeScript, heavily inspired
by Angular's dependency injection and module system. Prisma is a type-safe ORM
that generates a client based on your schema file.

## Setting up Prisma with NestJS

1. Install `@prisma/client` and `prisma` as a dev dependency.
2. Define your models in `schema.prisma`.
3. Run `prisma generate` to produce the typed client.
4. Wrap `PrismaClient` in an injectable `PrismaService` so NestJS can manage its
   lifecycle (connect on module init, disconnect on module destroy).

## Prisma v7 driver adapters

Prisma v7 introduced a driver-adapter architecture, meaning Prisma no longer ships
a built-in Rust query engine binary for every database. Instead, you install an
adapter package (for example `@prisma/adapter-pg` for Postgres) and pass a `pg.Pool`
instance to the Prisma client constructor. This removes the old `directUrl` /
pooled-URL split from earlier Prisma versions — there's a single connection string
now, since the adapter manages pooling itself.

## NestJS module organization

NestJS encourages splitting features into modules, each with its own controller,
service, and (optionally) a repository. Dependency injection tokens let you swap
implementations — this is exactly the pattern used for "ports" in a hexagonal
architecture: define an interface, bind it to a concrete adapter in the module,
and inject by token rather than by concrete class.
