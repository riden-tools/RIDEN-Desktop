#!/usr/bin/env python3
"""RD6006 Modbus RTU 模拟器（仅 Linux/macOS）。创建一个伪终端，打印其路径，供无真机时测试多设备。

用法: python3 scripts/mock-device.py [负载电阻Ω，默认 8]
在“添加设备”里手动填入打印出的路径即可连接。
"""
import os, pty, random, select, struct, sys, time, tty

LOAD = float(sys.argv[1]) if len(sys.argv) > 1 else 8.0


def crc(data):
    c = 0xFFFF
    for b in data:
        c ^= b
        for _ in range(8):
            c = (c >> 1) ^ 0xA001 if c & 1 else c >> 1
    return c


reg = [0] * 121
reg[0], reg[1], reg[2], reg[3] = 60067, 0, 4242, 115
reg[5], reg[8], reg[9], reg[14], reg[18], reg[72] = 32, 500, 2000, 2400, 0, 3
for k in range(10):
    reg[80 + k * 4: 84 + k * 4] = [500 + k * 100, 2000, 6200, 6200]


live_protection = reg[82:84].copy()

def update():
    v_set, i_set = reg[8] / 100, reg[9] / 1000
    if not reg[18]:
        v = i = 0.0
        cc = 0
    else:
        i = v_set / LOAD
        cc = int(i > i_set)
        i = min(i, i_set)
        v = i * LOAD if cc else v_set
        v += random.uniform(-0.004, 0.004)
        i = max(0.0, i + random.uniform(-0.0015, 0.0015))
    if reg[18] and (v * 100 > live_protection[0] or i * 1000 > live_protection[1]):
        reg[16] = 1 if v * 100 > live_protection[0] else 2
        reg[18] = 0
        v = i = 0.0
    p = round(v * i * 100)
    reg[10], reg[11] = max(0, round(v * 100)), max(0, round(i * 1000))
    reg[12], reg[13], reg[17] = p >> 16, p & 0xFFFF, cc
    reg[5] = 32 + int(v * i / 4)


def write_register(address, value):
    if address == 15:  # 与真机一致：通信期间面板保持锁定
        return
    reg[address] = value
    if address == 19 and 1 <= value <= 9:
        reg[8:10] = reg[80 + value * 4:82 + value * 4]
        live_protection[:] = reg[82 + value * 4:84 + value * 4]
    elif address in (82, 83):
        live_protection[address - 82] = value
    elif address == 18 and value == 1:
        reg[16] = 0


master, slave = pty.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
buf = b''
while True:
    if not select.select([master], [], [], 0.1)[0]:
        continue
    buf += os.read(master, 4096)
    while len(buf) >= 8:
        fn = buf[1]
        n = 9 + buf[6] if fn == 16 and len(buf) >= 7 else 8
        if len(buf) < n:
            break
        req, buf = buf[:n], buf[n:]
        if crc(req[:-2]) != int.from_bytes(req[-2:], 'little'):
            buf = b''
            break
        addr, fn, start, value = struct.unpack('>BBHH', req[:6])
        update()
        time.sleep(0.03)
        if fn == 3:
            resp = bytes([addr, 3, value * 2]) + struct.pack(f'>{value}H', *reg[start:start + value])
        elif fn == 6:
            write_register(start, value)
            resp = req[:6]
        elif fn == 16:
            for field, raw in enumerate(struct.unpack(f'>{value}H', req[7:-2])):
                write_register(start + field, raw)
            resp = req[:6]
        else:
            resp = bytes([addr, fn | 0x80, 1])
        os.write(master, resp + struct.pack('<H', crc(resp)))
