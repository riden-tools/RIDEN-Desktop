'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('riden', {
  appInfo: () => call('app:info'),
  listPorts: () => call('ports:list'),
  listDevices: () => call('devices:list'),
  addDevice: (config) => call('device:add', config),
  removeDevice: (id) => call('device:remove', id),
  renameDevice: (id, name) => call('device:rename', id, name),
  reconnect: (id) => call('device:reconnect', id),
  setModelProfile: (id, profile) => call('device:setModelProfile', id, profile),
  setVoltage: (id, v) => call('device:setVoltage', id, v),
  setCurrent: (id, i) => call('device:setCurrent', id, i),
  setOutput: (id, on) => call('device:setOutput', id, on),
  setLock: (id, on) => call('device:setLock', id, on),
  setBacklight: (id, level) => call('device:setBacklight', id, level),
  setProtection: (id, ovp, ocp) => call('device:setProtection', id, ovp, ocp),
  savePreset: (id, slot, v, i, ovp, ocp) => call('device:savePreset', id, slot, v, i, ovp, ocp),
  recallPreset: (id, slot) => call('device:recallPreset', id, slot),
  resetStats: (id) => call('device:resetStats', id),
  allOutputOff: () => call('all:outputOff'),
  saveCsv: (name, text) => call('csv:save', name, text),
  setTheme: (theme, background) => call('theme:set', theme, background),
  onState: on('device:state'),
  onSample: on('device:sample'),
  listPrograms: () => call('programs:list'),
  newProgram: (example) => call('programs:new', example),
  newBlock: (type, device) => call('programs:block', type, device),
  saveProgram: (p) => call('programs:save', p),
  removeProgram: (id) => call('programs:remove', id),
  importProgram: () => call('programs:import'),
  exportProgram: (p) => call('programs:export', p),
  validateProgram: (p) => call('programs:validate', p),
  programRuns: () => call('programs:runs'),
  runProgram: (id) => call('programs:runProgram', id),
  startProgram: (p, bindings, params) => call('programs:start', p, bindings, params),
  stopProgram: (id) => call('programs:stop', id),
  confirmBattery: (id, request, cells) => call('programs:confirm', id, request, cells),
  onProgram: on('program:update'),
});
