'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const KNOWN_CHIPS = {
  '1a86': 'CH340/CH341',
  '0403': 'FTDI',
  '10c4': 'CP210x',
  '067b': 'PL2303',
};

function readSys(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function linuxPorts() {
  const byId = {};
  try {
    for (const name of fs.readdirSync('/dev/serial/by-id')) {
      const target = path.resolve('/dev/serial/by-id', fs.readlinkSync(path.join('/dev/serial/by-id', name)));
      byId[target] = name;
    }
  } catch {
    /* 没有 by-id 目录时只列出设备节点 */
  }
  let nodes = [];
  try {
    nodes = fs.readdirSync('/dev').filter((n) => /^tty(USB|ACM)\d+$/.test(n));
  } catch {
    return [];
  }
  return nodes.sort().map((n) => {
    const dev = `/dev/${n}`;
    // device 指向 USB 接口（ttyACM）或 usb-serial 端口（ttyUSB），向上找到带 idVendor 的 USB 设备节点。
    const sys = [`/sys/class/tty/${n}/device/..`, `/sys/class/tty/${n}/device/../..`].find((p) =>
      fs.existsSync(`${p}/idVendor`),
    ) || '';
    const vid = readSys(`${sys}/idVendor`);
    const product = readSys(`${sys}/product`);
    const chip = KNOWN_CHIPS[vid] || product || '';
    let access = true;
    try {
      fs.accessSync(dev, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      access = false;
    }
    return { path: dev, label: n, detail: byId[dev] || product || '', chip, access };
  });
}

function windowsPorts() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM'], { windowsHide: true }, (err, out) => {
      if (err) return resolve([]);
      const ports = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^(\S+)\s+REG_SZ\s+(COM\d+)$/i);
        if (!m) continue;
        const com = m[2].toUpperCase();
        const driver = m[1].split('\\').pop();
        ports.push({ path: `\\\\.\\${com}`, label: com, detail: driver, chip: /ch34|wch/i.test(driver) ? 'CH340/CH341' : '', access: true });
      }
      ports.sort((a, b) => parseInt(a.label.slice(3)) - parseInt(b.label.slice(3)));
      resolve(ports);
    });
  });
}

async function listPorts() {
  if (process.platform === 'win32') return windowsPorts();
  return linuxPorts();
}

module.exports = { listPorts };
