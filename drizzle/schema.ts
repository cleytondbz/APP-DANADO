import { mysqlTable, varchar, int, decimal, text, datetime, enum as mysqlEnum, json } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// Tabela de Lojas
export const stores = mysqlTable('stores', {
  id: varchar('id', { length: 50 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  storeName: varchar('store_name', { length: 255 }).notNull(),
  cnpj: varchar('cnpj', { length: 20 }).notNull(),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
});

// Tabela de Categorias
export const categories = mysqlTable('categories', {
  id: varchar('id', { length: 50 }).primaryKey(),
  storeId: varchar('store_id', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  operation: mysqlEnum('operation', ['add', 'subtract', 'null']).notNull(),
  order: int('order').notNull().default(0),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
});

// Tabela de Lançamentos (Entries)
export const entries = mysqlTable('entries', {
  id: varchar('id', { length: 50 }).primaryKey(),
  storeId: varchar('store_id', { length: 50 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  values: json('values').$type<Record<string, number>>().notNull().default({}),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
});

// Tabela de Dívidas
export const debts = mysqlTable('debts', {
  id: varchar('id', { length: 50 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  personName: varchar('person_name', { length: 255 }).notNull(),
  description: text('description'),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  paid: int('paid').notNull().default(0), // 0 = false, 1 = true
  paidDate: varchar('paid_date', { length: 10 }),
  paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
});

// Tabela de Sincronização de Dados (AppContext)
export const syncData = mysqlTable('sync_data', {
  id: varchar('id', { length: 50 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  dataType: mysqlEnum('data_type', ['settings', 'stores', 'debts', 'entries']).notNull(),
  payload: json('payload').notNull(),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
});

// Relações
export const storesRelations = relations(stores, ({ many }) => ({
  categories: many(categories),
  entries: many(entries),
}));

export const categoriesRelations = relations(categories, ({ one }) => ({
  store: one(stores, {
    fields: [categories.storeId],
    references: [stores.id],
  }),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  store: one(stores, {
    fields: [entries.storeId],
    references: [stores.id],
  }),
}));
