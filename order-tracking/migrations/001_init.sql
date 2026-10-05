CREATE TABLE files (
    id            serial PRIMARY KEY,
    original_name text        NOT NULL,
    stored_name   text        NOT NULL,
    content_type  text        NOT NULL,
    size          bigint      NOT NULL,
    uploaded_at   timestamptz NOT NULL DEFAULT now()
);

-- Замовлення (договір)
CREATE TABLE contracts (
    id                     serial PRIMARY KEY,
    number                 text        NOT NULL,           -- зовнішній номер договору
    counterparty           text        NOT NULL,
    contract_date          date        NOT NULL,
    expected_delivery_date date,
    notes                  text,
    file_id                integer REFERENCES files (id) ON DELETE SET NULL,
    -- Нормалізовані (UPPER у JS) копії для пошуку без урахування регістру
    -- незалежно від локалі БД.
    number_search          text        NOT NULL,
    counterparty_search    text        NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contracts_number_counterparty_uq ON contracts (number_search, counterparty_search);
CREATE INDEX contracts_contract_date_idx ON contracts (contract_date);

-- Найменування (товар) у договорі
CREATE TABLE order_items (
    id                 serial PRIMARY KEY,
    contract_id        integer        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    name               text           NOT NULL,
    name_search        text           NOT NULL,
    unit               text           NOT NULL DEFAULT 'шт',
    quantity           numeric(14, 3) NOT NULL CHECK (quantity > 0),
    cancelled_quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (cancelled_quantity >= 0), -- "не зможуть"
    cancel_reason      text
);
CREATE INDEX order_items_contract_idx ON order_items (contract_id);
CREATE INDEX order_items_name_search_idx ON order_items (name_search);

-- Фактична поставка (накладна)
CREATE TABLE deliveries (
    id             serial PRIMARY KEY,
    contract_id    integer     NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    date           date        NOT NULL,
    invoice_number text        NOT NULL,
    file_id        integer REFERENCES files (id) ON DELETE SET NULL,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_contract_idx ON deliveries (contract_id);

CREATE TABLE delivery_lines (
    id            serial PRIMARY KEY,
    delivery_id   integer        NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
    order_item_id integer        NOT NULL REFERENCES order_items (id),
    quantity      numeric(14, 3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX delivery_lines_delivery_idx ON delivery_lines (delivery_id);
CREATE INDEX delivery_lines_item_idx ON delivery_lines (order_item_id);
