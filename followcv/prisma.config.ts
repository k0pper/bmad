import { config } from "dotenv";
config(); // loads .env
config({ path: ".env.local", override: true }); // local secrets take precedence

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
