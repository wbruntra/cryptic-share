import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("puzzles", (table) => {
    table.unique(["book", "puzzle_number"], { indexName: "puzzles_book_puzzle_number_unique" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("puzzles", (table) => {
    table.dropUnique(["book", "puzzle_number"], "puzzles_book_puzzle_number_unique");
  });
}
