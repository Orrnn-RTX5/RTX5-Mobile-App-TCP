import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BIN_ACTION_CANCEL_PENDING,
  BIN_ACTION_CLOSE_POSITION,
  BIN_ACTION_MODIFY_PENDING,
  BIN_ACTION_MODIFY_POSITION,
  BIN_ACTION_PLACE_MARKET,
  BIN_ACTION_PLACE_PENDING,
  BIN_FLAG_CLEAR_SL,
  BIN_FLAG_CLEAR_TP,
  BIN_FLAG_HAS_EXPIRATION,
  BIN_FLAG_HAS_PRICE,
  BIN_FLAG_HAS_SL,
  BIN_FLAG_HAS_STOP_LIMIT,
  BIN_FLAG_HAS_TP,
  BIN_FLAG_PARTIAL_CLOSE,
  BIN_SIDE_BUY,
  BIN_SIDE_NONE,
  BIN_SIDE_SELL,
  BIN_SUBTYPE_BUY_LIMIT,
  BIN_SUBTYPE_BUY_STOP,
  BIN_SUBTYPE_BUY_STOP_LIMIT,
  BIN_SUBTYPE_MARKET,
  BIN_SUBTYPE_SELL_LIMIT,
  BIN_SUBTYPE_SELL_STOP,
  BIN_SUBTYPE_SELL_STOP_LIMIT,
  BINARY_ORDER_REQ_HEADER_SIZE,
  BINARY_ORDER_RESP_HEADER_SIZE,
  decodeBinaryOrderFastResp,
  encodeBinaryOrderFastReq,
  encodePendingOrderSubType,
} from './binaryTcpOrderClient';

test('0x38 encodeBinaryOrderFastReq packs exact 128-byte little-endian header and stripped JWT token', () => {
  const token = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';
  const expectedCleanToken = 'eyJhbGciOiJIUzI1NiJ9.payload.sig';
  const encoded = encodeBinaryOrderFastReq(
    {
      action: BIN_ACTION_PLACE_MARKET,
      side: BIN_SIDE_BUY,
      subType: BIN_SUBTYPE_MARKET,
      flags: BIN_FLAG_PARTIAL_CLOSE,
      login: 5001234,
      ticket: 90005678,
      volume: 1.25,
      price: 2345.67,
      stopLimitPrice: 2340.5,
      sl: 2330.0,
      tp: 2370.0,
      expiration: 1735689600,
      symbol: ' xauusd ',
      clientOrderId: 'cid-abc-12345',
    },
    token,
  );

  assert.equal(
    encoded.byteLength,
    BINARY_ORDER_REQ_HEADER_SIZE + 2 + expectedCleanToken.length,
  );

  const dv = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  assert.equal(dv.getUint8(0), 1); // version = 1
  assert.equal(dv.getUint8(1), BIN_ACTION_PLACE_MARKET);
  assert.equal(dv.getUint8(2), BIN_SIDE_BUY);
  assert.equal(dv.getUint8(3), BIN_SUBTYPE_MARKET);

  const expectedFlags =
    BIN_FLAG_PARTIAL_CLOSE |
    BIN_FLAG_HAS_SL |
    BIN_FLAG_HAS_TP |
    BIN_FLAG_HAS_PRICE |
    BIN_FLAG_HAS_STOP_LIMIT |
    BIN_FLAG_HAS_EXPIRATION;
  assert.equal(dv.getUint16(4, true), expectedFlags);
  assert.equal(dv.getUint16(6, true), 0);
  assert.equal(dv.getBigInt64(8, true), 5001234n);
  assert.equal(dv.getBigInt64(16, true), 90005678n);
  assert.equal(dv.getFloat64(24, true), 1.25);
  assert.equal(dv.getFloat64(32, true), 2345.67);
  assert.equal(dv.getFloat64(40, true), 2340.5);
  assert.equal(dv.getFloat64(48, true), 2330.0);
  assert.equal(dv.getFloat64(56, true), 2370.0);
  assert.equal(dv.getBigInt64(64, true), 1735689600n);

  const symbolBytes = encoded.subarray(72, 88);
  const symbolStr = new TextDecoder().decode(symbolBytes).replace(/\0+$/, '');
  assert.equal(symbolStr, 'XAUUSD');

  const cidBytes = encoded.subarray(88, 128);
  const cidStr = new TextDecoder().decode(cidBytes).replace(/\0+$/, '');
  assert.equal(cidStr, 'cid-abc-12345');

  const tokenLen = dv.getUint16(128, true);
  assert.equal(tokenLen, expectedCleanToken.length);
  const decodedToken = new TextDecoder().decode(encoded.subarray(130, 130 + tokenLen));
  assert.equal(decodedToken, expectedCleanToken);
});

test('0x39 decodeBinaryOrderFastResp unpacks 136-byte header and optional errorCode/message trailer', () => {
  const errorCode = 'MARKET_CLOSED';
  const message = 'Market is currently closed for XAUUSD';
  const errBytes = new TextEncoder().encode(errorCode);
  const msgBytes = new TextEncoder().encode(message);

  const totalLen = BINARY_ORDER_RESP_HEADER_SIZE + 2 + errBytes.byteLength + 2 + msgBytes.byteLength;
  const buf = new Uint8Array(totalLen);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  dv.setUint8(0, 1); // version = 1
  dv.setUint8(1, BIN_ACTION_CLOSE_POSITION);
  dv.setUint16(2, 200, true);
  dv.setUint32(4, 845, true); // execMicros
  dv.setBigInt64(8, 10001n, true);
  dv.setBigInt64(16, 20002n, true);
  dv.setBigInt64(24, 30003n, true);
  dv.setFloat64(32, 2350.25, true);
  dv.setFloat64(40, 0.5, true);
  dv.setFloat64(48, 125.75, true);
  dv.setFloat64(56, -3.5, true);
  dv.setFloat64(64, 2340.0, true);
  dv.setFloat64(72, 2360.0, true);

  buf.set(new TextEncoder().encode('XAUUSD'), 80);
  buf.set(new TextEncoder().encode('cid-close-99'), 96);

  let offset = BINARY_ORDER_RESP_HEADER_SIZE;
  dv.setUint16(offset, errBytes.byteLength, true);
  offset += 2;
  buf.set(errBytes, offset);
  offset += errBytes.byteLength;
  dv.setUint16(offset, msgBytes.byteLength, true);
  offset += 2;
  buf.set(msgBytes, offset);

  const decoded = decodeBinaryOrderFastResp(buf);
  assert.ok(decoded);
  assert.deepEqual(decoded, {
    version: 1,
    action: BIN_ACTION_CLOSE_POSITION,
    status: 200,
    execMicros: 845,
    orderTicket: 10001,
    positionTicket: 20002,
    dealTicket: 30003,
    fillPrice: 2350.25,
    volume: 0.5,
    profit: 125.75,
    commission: -3.5,
    sl: 2340.0,
    tp: 2360.0,
    symbol: 'XAUUSD',
    clientOrderId: 'cid-close-99',
    errorCode: 'MARKET_CLOSED',
    message: 'Market is currently closed for XAUUSD',
  });

  // Rejects truncated frames or unsupported protocol versions
  assert.equal(decodeBinaryOrderFastResp(buf.subarray(0, BINARY_ORDER_RESP_HEADER_SIZE - 1)), null);
  const badVer = new Uint8Array(buf);
  badVer[0] = 2;
  assert.equal(decodeBinaryOrderFastResp(badVer), null);
});

test('encodePendingOrderSubType maps all 6 pending order types to exact TCP side and subType codes', () => {
  assert.deepEqual(encodePendingOrderSubType('buy_limit'), {
    side: BIN_SIDE_BUY,
    subType: BIN_SUBTYPE_BUY_LIMIT,
  });
  assert.deepEqual(encodePendingOrderSubType('SELL_LIMIT'), {
    side: BIN_SIDE_SELL,
    subType: BIN_SUBTYPE_SELL_LIMIT,
  });
  assert.deepEqual(encodePendingOrderSubType('buy_stop'), {
    side: BIN_SIDE_BUY,
    subType: BIN_SUBTYPE_BUY_STOP,
  });
  assert.deepEqual(encodePendingOrderSubType('sell_stop'), {
    side: BIN_SIDE_SELL,
    subType: BIN_SUBTYPE_SELL_STOP,
  });
  assert.deepEqual(encodePendingOrderSubType('buy_stop_limit'), {
    side: BIN_SIDE_BUY,
    subType: BIN_SUBTYPE_BUY_STOP_LIMIT,
  });
  assert.deepEqual(encodePendingOrderSubType('sell_stop_limit'), {
    side: BIN_SIDE_SELL,
    subType: BIN_SUBTYPE_SELL_STOP_LIMIT,
  });
  assert.deepEqual(encodePendingOrderSubType('unknown'), {
    side: BIN_SIDE_NONE,
    subType: BIN_SUBTYPE_MARKET,
  });
  assert.ok(BIN_ACTION_MODIFY_POSITION > 0);
  assert.ok(BIN_ACTION_PLACE_PENDING > 0);
  assert.ok(BIN_ACTION_MODIFY_PENDING > 0);
  assert.ok(BIN_ACTION_CANCEL_PENDING > 0);
  assert.ok(BIN_FLAG_CLEAR_SL > 0);
  assert.ok(BIN_FLAG_CLEAR_TP > 0);
});
