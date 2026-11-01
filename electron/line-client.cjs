'use strict';
const net = require('node:net');
const { EventEmitter } = require('node:events');

// riden-cored 的 NDJSON 连接：一行一个 JSON，请求用 id 关联响应。
class LineClient extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', () => {});
    socket.on('close', () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('连接已关闭'));
      }
      this.pending.clear();
      this.emit('close');
    });
  }

  static connect(port, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('连接超时'));
      }, timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        resolve(new LineClient(socket));
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  #onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        this.pending.delete(msg.id);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.emit('message', msg);
      }
    }
  }

  send(obj) {
    if (!this.closed) this.socket.write(JSON.stringify(obj) + '\n');
  }

  request(obj, timeoutMs = 4000) {
    if (this.closed) return Promise.reject(new Error('连接已关闭'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('请求超时'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, ...obj });
    });
  }

  close() {
    this.socket.destroy();
  }
}

module.exports = { LineClient };
