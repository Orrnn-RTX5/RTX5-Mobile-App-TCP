/**
 * Binary TCP Order Fast-Lane Client (0x38 BinaryOrderFastReq -> 0x39 BinaryOrderFastResp)
 *
 * Bridges mobile trade execution (Market, Pending, Close, Modify Position,
 * Modify Pending, Cancel Pending) to the embedded local clientcore Binary TCP
 * bridge at `ws://127.0.0.1:18404/__rtx5_binary_order_ws` (or
 * `POST http://127.0.0.1:18404/__rtx5_binary_order`), which forwards the
 * 128-byte little-endian binary header + JWT token (0x38) over the multiplexed
 * Encrypted Binary TCP tunnel (:4443) and unpacks the 136-byte response (0x39).
 */
import { captureActiveBrokerSession } from '../state/activeBrokerSession';

export const BINARY_ORDER_REQ_HEADER_SIZE = 128;
export const BINARY_ORDER_RESP_HEADER_SIZE = 136;

export const BIN_ACTION_PLACE_MARKET = 1;
export const BIN_ACTION_CLOSE_POSITION = 2;
export const BIN_ACTION_MODIFY_POSITION = 3;
export const BIN_ACTION_PLACE_PENDING = 4;
export const BIN_ACTION_MODIFY_PENDING = 5;
export const BIN_ACTION_CANCEL_PENDING = 6;
export const BIN_ACTION_CLOSE_BULK = 7;

export const BIN_SIDE_NONE = 0;
export const BIN_SIDE_BUY = 1;
export const BIN_SIDE_SELL = 2;

export const BIN_SUBTYPE_MARKET = 0;
export const BIN_SUBTYPE_BUY_LIMIT = 1;
export const BIN_SUBTYPE_SELL_LIMIT = 2;
export const BIN_SUBTYPE_BUY_STOP = 3;
export const BIN_SUBTYPE_SELL_STOP = 4;
export const BIN_SUBTYPE_BUY_STOP_LIMIT = 5;
export const BIN_SUBTYPE_SELL_STOP_LIMIT = 6;

export const BIN_FLAG_HAS_SL = 0x0001;
export const BIN_FLAG_HAS_TP = 0x0002;
export const BIN_FLAG_PARTIAL_CLOSE = 0x0004;
export const BIN_FLAG_CLEAR_SL = 0x0008;
export const BIN_FLAG_CLEAR_TP = 0x0010;
export const BIN_FLAG_HAS_PRICE = 0x0020;
export const BIN_FLAG_HAS_STOP_LIMIT = 0x0040;
export const BIN_FLAG_HAS_EXPIRATION = 0x0080;

export interface BinaryOrderFastRequestInput {
  action: number;
  side?: number;
  subType?: number;
  flags?: number;
  login?: number | string;
  ticket?: number | string;
  volume?: number | string;
  price?: number | string;
  stopLimitPrice?: number | string;
  sl?: number | string | null;
  tp?: number | string | null;
  expiration?: number | null;
  symbol?: string;
  clientOrderId?: string;
}

export interface BinaryOrderFastResponseDecoded {
  version: number;
  action: number;
  status: number;
  execMicros: number;
  orderTicket: number;
  positionTicket: number;
  dealTicket: number;
  fillPrice: number;
  volume: number;
  profit: number;
  commission: number;
  sl: number;
  tp: number;
  symbol: string;
  clientOrderId: string;
  errorCode: string;
  message: string;
}

const writeAsciiFixed = (
  buf: Uint8Array,
  offset: number,
  maxLen: number,
  str: string | undefined,
): void => {
  buf.fill(0, offset, offset + maxLen);
  if (!str) return;
  const n = Math.min(str.length, maxLen);
  for (let i = 0; i < n; i += 1) {
    buf[offset + i] = str.charCodeAt(i) & 0x7f;
  }
};

const readAsciiFixed = (
  buf: Uint8Array,
  offset: number,
  maxLen: number,
): string => {
  let end = offset;
  const limit = offset + maxLen;
  while (end < limit && buf[end] !== 0) {
    end += 1;
  }
  let out = '';
  for (let i = offset; i < end; i += 1) {
    out += String.fromCharCode(buf[i]);
  }
  return out.trim();
};

const toBigInt64 = (value: number | string | undefined | null): bigint => {
  if (value === undefined || value === null || value === '') return 0n;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0n;
    return BigInt(Math.trunc(value));
  }
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return 0n;
  return BigInt(trimmed);
};

const toFloat64 = (value: number | string | undefined | null): number => {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : 0;
};

const encodeUtf8 = (text: string): Uint8Array => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
};

const decodeUtf8 = (bytes: Uint8Array): string => {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
};

/**
 * Encodes a 0x38 BinaryOrderFastReq frame matching `clientcore/binary_order_bridge.go`:
 * - [0..127]: 128-byte fixed header (`[72..87]` Symbol, `[88..127]` ClientOrderID)
 * - [128..129]: uint16 LE `tokenLen`
 * - [130..130+tokenLen]: UTF-8 raw JWT access token
 */
export function encodeBinaryOrderFastReq(
  req: BinaryOrderFastRequestInput,
  rawToken: string,
): Uint8Array {
  const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim();
  const tokenBytes = encodeUtf8(cleanToken);
  const totalLen = BINARY_ORDER_REQ_HEADER_SIZE + 2 + tokenBytes.byteLength;
  const buf = new Uint8Array(totalLen);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let flags = req.flags ?? 0;
  const slNum = toFloat64(req.sl);
  const tpNum = toFloat64(req.tp);
  const priceNum = toFloat64(req.price);
  const stopLimitNum = toFloat64(req.stopLimitPrice);
  const expNum = toBigInt64(req.expiration ?? 0);

  if (slNum > 0) flags |= BIN_FLAG_HAS_SL;
  if (tpNum > 0) flags |= BIN_FLAG_HAS_TP;
  if (priceNum > 0) flags |= BIN_FLAG_HAS_PRICE;
  if (stopLimitNum > 0) flags |= BIN_FLAG_HAS_STOP_LIMIT;
  if (expNum > 0n) flags |= BIN_FLAG_HAS_EXPIRATION;

  dv.setUint8(0, 1); // Version = 1
  dv.setUint8(1, req.action & 0xff);
  dv.setUint8(2, (req.side ?? 0) & 0xff);
  dv.setUint8(3, (req.subType ?? 0) & 0xff);
  dv.setUint16(4, flags & 0xffff, true);
  dv.setUint16(6, 0, true);
  dv.setBigInt64(8, toBigInt64(req.login), true);
  dv.setBigInt64(16, toBigInt64(req.ticket), true);
  dv.setFloat64(24, toFloat64(req.volume), true);
  dv.setFloat64(32, priceNum, true);
  dv.setFloat64(40, stopLimitNum, true);
  dv.setFloat64(48, slNum, true);
  dv.setFloat64(56, tpNum, true);
  dv.setBigInt64(64, expNum, true);

  writeAsciiFixed(buf, 72, 16, (req.symbol ?? '').trim().toUpperCase());
  writeAsciiFixed(buf, 88, 40, (req.clientOrderId ?? '').trim());

  dv.setUint16(128, tokenBytes.byteLength, true);
  buf.set(tokenBytes, 130);
  return buf;
}

/**
 * Decodes a 0x39 BinaryOrderFastResp frame (136-byte fixed header + optional
 * variable-length errorCode and message).
 */
export function decodeBinaryOrderFastResp(
  raw: ArrayBuffer | Uint8Array,
): BinaryOrderFastResponseDecoded | null {
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (u8.byteLength < BINARY_ORDER_RESP_HEADER_SIZE) {
    return null;
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = dv.getUint8(0);
  if (version !== 1) return null;

  const action = dv.getUint8(1);
  const status = dv.getUint16(2, true);
  const execMicros = dv.getUint32(4, true);
  const orderTicket = Number(dv.getBigInt64(8, true));
  const positionTicket = Number(dv.getBigInt64(16, true));
  const dealTicket = Number(dv.getBigInt64(24, true));
  const fillPrice = dv.getFloat64(32, true);
  const volume = dv.getFloat64(40, true);
  const profit = dv.getFloat64(48, true);
  const commission = dv.getFloat64(56, true);
  const sl = dv.getFloat64(64, true);
  const tp = dv.getFloat64(72, true);
  const symbol = readAsciiFixed(u8, 80, 16);
  const clientOrderId = readAsciiFixed(u8, 96, 40);

  let errorCode = '';
  let message = '';
  if (u8.byteLength >= BINARY_ORDER_RESP_HEADER_SIZE + 2) {
    const errCodeLen = dv.getUint16(136, true);
    let offset = 138;
    if (errCodeLen > 0 && offset + errCodeLen <= u8.byteLength) {
      errorCode = decodeUtf8(u8.subarray(offset, offset + errCodeLen));
      offset += errCodeLen;
    } else if (errCodeLen > 0) {
      offset = u8.byteLength;
    }
    if (offset + 2 <= u8.byteLength) {
      const msgLen = dv.getUint16(offset, true);
      offset += 2;
      if (msgLen > 0 && offset + msgLen <= u8.byteLength) {
        message = decodeUtf8(u8.subarray(offset, offset + msgLen));
      }
    }
  }

  return {
    version,
    action,
    status,
    execMicros,
    orderTicket,
    positionTicket,
    dealTicket,
    fillPrice,
    volume,
    profit,
    commission,
    sl,
    tp,
    symbol,
    clientOrderId,
    errorCode,
    message,
  };
}

export function encodePendingOrderSubType(typeStr: string): { side: number; subType: number } {
  switch (typeStr.trim().toLowerCase()) {
    case 'buy_limit':
      return { side: BIN_SIDE_BUY, subType: BIN_SUBTYPE_BUY_LIMIT };
    case 'sell_limit':
      return { side: BIN_SIDE_SELL, subType: BIN_SUBTYPE_SELL_LIMIT };
    case 'buy_stop':
      return { side: BIN_SIDE_BUY, subType: BIN_SUBTYPE_BUY_STOP };
    case 'sell_stop':
      return { side: BIN_SIDE_SELL, subType: BIN_SUBTYPE_SELL_STOP };
    case 'buy_stop_limit':
      return { side: BIN_SIDE_BUY, subType: BIN_SUBTYPE_BUY_STOP_LIMIT };
    case 'sell_stop_limit':
      return { side: BIN_SIDE_SELL, subType: BIN_SUBTYPE_SELL_STOP_LIMIT };
    default:
      return { side: BIN_SIDE_NONE, subType: BIN_SUBTYPE_MARKET };
  }
}

const sendViaWebSocketOnce = (
  wsUrl: string,
  payload: Uint8Array,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<BinaryOrderFastResponseDecoded | null> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (value: BinaryOrderFastResponseDecoded | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try {
        ws?.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      const reqId = ((Date.now() & 0x7fffffff) || 1) >>> 0;
      ws.onopen = () => {
        try {
          const wsFrame = new Uint8Array(4 + payload.byteLength);
          new DataView(wsFrame.buffer, wsFrame.byteOffset, 4).setUint32(0, reqId, true);
          wsFrame.set(payload, 4);
          ws?.send(wsFrame);
        } catch {
          finish(null);
        }
      };
      ws.onmessage = (event: MessageEvent) => {
        let rawBytes: Uint8Array | null = null;
        if (event.data instanceof ArrayBuffer) {
          rawBytes = new Uint8Array(event.data);
        } else if (ArrayBuffer.isView(event.data)) {
          rawBytes = new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          );
        }
        if (!rawBytes || rawBytes.byteLength < 4 + BINARY_ORDER_RESP_HEADER_SIZE) {
          finish(null);
          return;
        }
        finish(decodeBinaryOrderFastResp(rawBytes.subarray(4)));
      };
      ws.onerror = () => finish(null);
      ws.onclose = () => finish(null);
    } catch {
      finish(null);
    }
  });

/**
 * Executes a `0x38 -> 0x39` Binary TCP Fast-Lane order over `/__rtx5_binary_order_ws`
 * (with HTTP `/__rtx5_binary_order` fallback). Returns `null` if the active
 * session is not backed by the local `clientcore` bridge or if the fast-lane
 * transport is unavailable, allowing the caller to fall back cleanly to `apiClient`.
 */
export async function executeBinaryOrderFast(
  input: BinaryOrderFastRequestInput,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<BinaryOrderFastResponseDecoded | null> {
  const capture = captureActiveBrokerSession();
  if (!capture?.credentials.accessToken) {
    return null;
  }

  let httpOrigin = 'http://127.0.0.1:18404';
  let wsOrigin = 'ws://127.0.0.1:18404';
  try {
    const parsed = new URL(capture.session.apiBase);
    if (
      parsed.hostname !== '127.0.0.1' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '10.0.2.2'
    ) {
      return null;
    }
    httpOrigin = `${parsed.protocol}//${parsed.host}`;
    wsOrigin = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`;
  } catch {
    return null;
  }

  const reqBytes = encodeBinaryOrderFastReq(input, capture.credentials.accessToken);
  const timeoutMs = options?.timeoutMs ?? 15_000;

  const wsResp = await sendViaWebSocketOnce(
    `${wsOrigin}/__rtx5_binary_order_ws`,
    reqBytes,
    timeoutMs,
    options?.signal,
  );
  if (wsResp && wsResp.status !== 0 && wsResp.status !== 502 && wsResp.status !== 504) {
    return wsResp;
  }

  // Fallback to HTTP POST /__rtx5_binary_order
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(`${httpOrigin}/__rtx5_binary_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Accept: 'application/octet-stream',
        Authorization: `Bearer ${capture.credentials.accessToken}`,
      },
      body: reqBytes as unknown as BodyInit,
      signal: controller.signal,
    });
    if (res.status === 404 || res.status === 502 || res.status === 504) {
      return null;
    }
    const buf = await res.arrayBuffer();
    const decoded = decodeBinaryOrderFastResp(buf);
    if (!decoded || decoded.status === 0 || decoded.status === 502 || decoded.status === 504) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Wraps `executeBinaryOrderFast` as a standard HTTP `Response` object with the
 * exact JSON payload expected by the mobile order/position callers.
 */
export async function executeBinaryOrderAsHttpResponse(
  input: BinaryOrderFastRequestInput,
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    expectedModifyEcho?: {
      price_sl?: number | null;
      price_tp?: number | null;
    };
  },
): Promise<Response | null> {
  const resp = await executeBinaryOrderFast(input, options);
  if (!resp) return null;

  let bodyObj: Record<string, unknown>;
  if (resp.status >= 400) {
    bodyObj = {
      error: resp.errorCode || 'ORDER_REJECTED',
      code: resp.errorCode || 'ORDER_REJECTED',
      message: resp.message || resp.errorCode || 'Order rejected by trading server.',
    };
  } else if (resp.status === 202) {
    bodyObj = {
      status: 'order_accepted',
      client_order_id: resp.clientOrderId || input.clientOrderId || '',
      order_ticket: resp.orderTicket || 0,
      ticket: resp.positionTicket || resp.orderTicket || Number(input.ticket) || 0,
    };
  } else {
    switch (input.action) {
      case BIN_ACTION_PLACE_MARKET: {
        const posTicket = resp.positionTicket || resp.orderTicket;
        bodyObj = {
          status: 'filled',
          action: input.side === BIN_SIDE_SELL ? 'sell' : 'buy',
          symbol: resp.symbol || input.symbol || '',
          order_ticket: resp.orderTicket || posTicket,
          position_ticket: posTicket,
          deal_ticket: resp.dealTicket || 0,
          ticket: posTicket,
          price: resp.fillPrice,
          open_price: resp.fillPrice,
          volume: resp.volume || Number(input.volume) || 0,
          ...(resp.sl > 0 ? { sl: resp.sl, price_sl: resp.sl } : {}),
          ...(resp.tp > 0 ? { tp: resp.tp, price_tp: resp.tp } : {}),
          client_order_id: resp.clientOrderId || input.clientOrderId || '',
        };
        break;
      }
      case BIN_ACTION_CLOSE_POSITION: {
        const isPartial = ((input.flags ?? 0) & BIN_FLAG_PARTIAL_CLOSE) !== 0;
        bodyObj = {
          status: isPartial ? 'partial_closed' : 'closed',
          ticket: resp.positionTicket || Number(input.ticket) || 0,
          order_ticket: String(resp.orderTicket || resp.dealTicket || input.ticket || '0'),
          deal_ticket: String(resp.dealTicket || resp.orderTicket || '0'),
          price: resp.fillPrice,
          close_price: resp.fillPrice,
          volume: resp.volume || Number(input.volume) || 0,
          profit: resp.profit,
          client_order_id: resp.clientOrderId || input.clientOrderId || '',
        };
        break;
      }
      case BIN_ACTION_MODIFY_POSITION: {
        const nowSec = Math.floor(Date.now() / 1000);
        const echo = options?.expectedModifyEcho;
        const slEcho =
          echo && Object.prototype.hasOwnProperty.call(echo, 'price_sl')
            ? echo.price_sl === 0 || echo.price_sl === null
              ? null
              : echo.price_sl
            : resp.sl > 0
              ? resp.sl
              : null;
        const tpEcho =
          echo && Object.prototype.hasOwnProperty.call(echo, 'price_tp')
            ? echo.price_tp === 0 || echo.price_tp === null
              ? null
              : echo.price_tp
            : resp.tp > 0
              ? resp.tp
              : null;
        bodyObj = {
          ticket: Number(input.ticket) || resp.positionTicket || 0,
          symbol: resp.symbol || input.symbol || '',
          status: 'modified',
          time: nowSec,
          sl: slEcho,
          price_sl: slEcho,
          tp: tpEcho,
          price_tp: tpEcho,
        };
        break;
      }
      case BIN_ACTION_PLACE_PENDING: {
        const ordTicket = resp.orderTicket || resp.positionTicket;
        bodyObj = {
          status: 'pending',
          ticket: ordTicket,
          order_ticket: ordTicket,
          symbol: resp.symbol || input.symbol || '',
          price: resp.fillPrice || Number(input.price) || 0,
          volume: resp.volume || Number(input.volume) || 0,
          ...(resp.sl > 0 ? { sl: resp.sl, price_sl: resp.sl } : {}),
          ...(resp.tp > 0 ? { tp: resp.tp, price_tp: resp.tp } : {}),
          client_order_id: resp.clientOrderId || input.clientOrderId || '',
        };
        break;
      }
      case BIN_ACTION_MODIFY_PENDING: {
        bodyObj = {
          ticket: Number(input.ticket) || resp.orderTicket || 0,
          status: 'modified',
          time: Math.floor(Date.now() / 1000),
        };
        break;
      }
      case BIN_ACTION_CANCEL_PENDING: {
        bodyObj = {
          ticket: Number(input.ticket) || resp.orderTicket || 0,
          status: 'cancelled',
          time: Math.floor(Date.now() / 1000),
        };
        break;
      }
      default:
        bodyObj = { status: 'ok' };
    }
  }

  const httpStatus = resp.status >= 200 && resp.status <= 599 ? resp.status : 200;
  return new Response(JSON.stringify(bodyObj), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'X-RTX5-Transport': 'binary-tcp-0x38-0x39',
      'Server-Timing': `rtx5_bin;dur=${(resp.execMicros / 1000).toFixed(2)}`,
    },
  });
}
