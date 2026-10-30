CREATE DATABASE IF NOT EXISTS stockdb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE stockdb;

CREATE TABLE IF NOT EXISTS tickers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticker VARCHAR(24) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  exchange_code VARCHAR(16) NOT NULL DEFAULT 'IDX',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_tickers_ticker (ticker), KEY idx_tickers_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS latest_quotes (
  ticker VARCHAR(24) NOT NULL,
  price DECIMAL(18,4) NULL,
  previous_close DECIMAL(18,4) NULL,
  open_price DECIMAL(18,4) NULL,
  day_high DECIMAL(18,4) NULL,
  day_low DECIMAL(18,4) NULL,
  volume BIGINT NULL,
  currency VARCHAR(8) NULL,
  market_time DATETIME NULL COMMENT 'Timestamp supplied by market data source, UTC',
  fetched_at DATETIME NOT NULL COMMENT 'Timestamp collector fetched quote, UTC',
  source VARCHAR(64) NOT NULL DEFAULT 'Yahoo Finance via yfinance',
  status VARCHAR(24) NOT NULL DEFAULT 'ok',
  PRIMARY KEY (ticker), KEY idx_quote_fetched (fetched_at),
  CONSTRAINT fk_quote_ticker FOREIGN KEY (ticker) REFERENCES tickers(ticker) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS price_bars (
  ticker VARCHAR(24) NOT NULL,
  interval_code VARCHAR(8) NOT NULL,
  bar_time DATETIME NOT NULL COMMENT 'Bar timestamp, UTC',
  open_price DECIMAL(18,4) NULL, high_price DECIMAL(18,4) NULL,
  low_price DECIMAL(18,4) NULL, close_price DECIMAL(18,4) NULL,
  adj_close DECIMAL(18,4) NULL, volume BIGINT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'Yahoo Finance via yfinance',
  ingested_at DATETIME NOT NULL,
  PRIMARY KEY (ticker, interval_code, bar_time), KEY idx_bars_time (bar_time),
  CONSTRAINT fk_bars_ticker FOREIGN KEY (ticker) REFERENCES tickers(ticker) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fundamentals (
  ticker VARCHAR(24) NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  metric_value DECIMAL(24,8) NULL,
  currency VARCHAR(8) NULL,
  period_end DATE NOT NULL,
  fetched_at DATETIME NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'Yahoo Finance via yfinance',
  PRIMARY KEY (ticker, metric_name, period_end), KEY idx_fundamentals_fetch (fetched_at),
  CONSTRAINT fk_fundamentals_ticker FOREIGN KEY (ticker) REFERENCES tickers(ticker) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_name VARCHAR(64) NOT NULL,
  ticker VARCHAR(24) NULL,
  status VARCHAR(24) NOT NULL,
  records_written INT NOT NULL DEFAULT 0,
  message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NOT NULL,
  PRIMARY KEY (id), KEY idx_sync_job_time (job_name, finished_at), KEY idx_sync_status (status)
) ENGINE=InnoDB;

-- Seed only a small starter set. Replace/import the full current IDX ticker catalogue from a verified source.
INSERT INTO tickers (ticker, company_name) VALUES
('BBCA.JK','Bank Central Asia Tbk'), ('BBRI.JK','Bank Rakyat Indonesia (Persero) Tbk'),
('BMRI.JK','Bank Mandiri (Persero) Tbk'), ('TLKM.JK','Telkom Indonesia (Persero) Tbk'),
('ASII.JK','Astra International Tbk'), ('BBNI.JK','Bank Negara Indonesia (Persero) Tbk')
ON DUPLICATE KEY UPDATE company_name=VALUES(company_name), is_active=TRUE;
