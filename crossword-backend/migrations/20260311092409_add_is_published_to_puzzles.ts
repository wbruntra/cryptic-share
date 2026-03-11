import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add the column
  await knex.schema.alterTable("puzzles", (table) => {
    table.boolean("is_published").notNullable().defaultTo(true);
  });

  // Explicitly set is_published to false for puzzles that contain pending clues
  await knex("puzzles")
    .where("clues", "like", "%CLUE PENDING%")
    .update({ is_published: false });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("puzzles", (table) => {
    table.dropColumn("is_published");
  });
}

