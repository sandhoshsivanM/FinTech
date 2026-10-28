-- One Postgres, one database per service (each service owns its schema).
CREATE DATABASE marketdata;
CREATE DATABASE identity;
CREATE DATABASE devices;
CREATE DATABASE sync;
CREATE DATABASE notification;
CREATE DATABASE reporting;
CREATE DATABASE catalog;
-- Added with bank linking. A demo whose volume already exists gets these from
-- the services' own migrations (EF creates a missing database at startup).
CREATE DATABASE aa;
CREATE DATABASE credit;
