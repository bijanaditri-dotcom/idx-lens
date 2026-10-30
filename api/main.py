from __future__ import annotations
import os, secrets
from datetime import datetime
from decimal import Decimal
from typing import Optional
import mysql.connector
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()
app = FastAPI(title='IDX Lens Market Data API', version='1.0.0')
origins=[x.strip() for x in os.getenv('CORS_ORIGINS','http://localhost:3000').split(',') if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=['GET'], allow_headers=['Authorization','Content-Type'])

def connect():
    required=['MYSQL_HOST','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE']
    if any(not os.getenv(k) for k in required): raise RuntimeError('Database environment is incomplete')
    return mysql.connector.connect(host=os.environ['MYSQL_HOST'],port=int(os.getenv('MYSQL_PORT','3306')),user=os.environ['MYSQL_USER'],password=os.environ['MYSQL_PASSWORD'],database=os.environ['MYSQL_DATABASE'],connection_timeout=5,autocommit=True)

def auth(authorization: Optional[str]):
    expected=os.getenv('API_BEARER_TOKEN','')
    if not expected: raise HTTPException(503,'API bearer token is not configured')
    if not authorization or not authorization.lower().startswith('bearer ') or not secrets.compare_digest(authorization[7:].strip(),expected):
        raise HTTPException(401,'Unauthorized')

def clean(v):
    if isinstance(v, Decimal): return float(v)
    if isinstance(v, datetime): return v.isoformat()+'Z'
    return v

def rows(sql, params=()):
    cn=connect()
    try:
        cur=cn.cursor(dictionary=True); cur.execute(sql,params); data=cur.fetchall(); cur.close()
        return [{k:clean(v) for k,v in row.items()} for row in data]
    finally: cn.close()

@app.get('/health')
def health():
    try:
        data=rows('SELECT UTC_TIMESTAMP() AS server_time_utc, COUNT(*) AS quote_count, MAX(fetched_at) AS latest_fetch_utc FROM latest_quotes')
        return {'status':'ok','database':'connected',**data[0]}
    except Exception as e: return JSONResponse(status_code=503,content={'status':'error','database':'unavailable','detail':str(e)[:250]})

@app.get('/v1/quotes')
def quotes(authorization: Optional[str]=Header(default=None), limit: int=Query(default=500,ge=1,le=2000), ticker: Optional[str]=None):
    auth(authorization)
    if ticker:
        return rows('''SELECT q.*,t.company_name,t.is_active FROM latest_quotes q JOIN tickers t USING(ticker) WHERE q.ticker=%s LIMIT 1''',(ticker.strip().upper(),))
    return rows('''SELECT q.*,t.company_name,t.is_active FROM latest_quotes q JOIN tickers t USING(ticker) WHERE t.is_active=TRUE ORDER BY q.ticker LIMIT %s''',(limit,))

@app.get('/v1/bars')
def bars(authorization: Optional[str]=Header(default=None), ticker: str=Query(min_length=1,max_length=24), interval: str=Query(default='1m',pattern='^(1m|2m|5m|15m|30m|60m|1d|1wk)$'), limit: int=Query(default=500,ge=1,le=5000)):
    auth(authorization)
    return rows('''SELECT ticker,interval_code,bar_time,open_price,high_price,low_price,close_price,adj_close,volume,source,ingested_at FROM price_bars WHERE ticker=%s AND interval_code=%s ORDER BY bar_time DESC LIMIT %s''',(ticker.strip().upper(),interval,limit))[::-1]

@app.get('/v1/fundamentals')
def fundamentals(authorization: Optional[str]=Header(default=None), ticker: str=Query(min_length=1,max_length=24)):
    auth(authorization)
    return rows('SELECT ticker,metric_name,metric_value,currency,period_end,fetched_at,source FROM fundamentals WHERE ticker=%s ORDER BY metric_name,period_end DESC',(ticker.strip().upper(),))

@app.get('/v1/sync-status')
def sync_status(authorization: Optional[str]=Header(default=None), limit: int=Query(default=50,ge=1,le=200)):
    auth(authorization)
    return rows('SELECT id,job_name,ticker,status,records_written,message,started_at,finished_at FROM sync_logs ORDER BY id DESC LIMIT %s',(limit,))
