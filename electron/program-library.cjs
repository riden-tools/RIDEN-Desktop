'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chargingProgram } = require('./program-schema.cjs');
const { validateProgram } = require('./program-engine.cjs');
class ProgramLibrary {
  constructor(file) {
    this.file = file;
    this.programs = [chargingProgram()];
    // A corrupt file is surfaced, never silently overwritten with an empty library.
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data) || data.length > 100) throw new Error('程序库格式无效');
      this.programs = data.map(validateProgram);
    }
  }
  list() { return structuredClone(this.programs); }
  persist(programs) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(programs, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    this.programs = programs;
  }
  save(input) {
    const p = validateProgram(input);
    const next = this.programs.filter((x) => x.id !== p.id);
    if (next.length >= 100) throw new Error('程序库最多保存 100 个程序');
    next.push(p);
    this.persist(next);
    return p;
  }
  remove(id) { this.persist(this.programs.filter((p) => p.id !== id)); }
}
module.exports = { ProgramLibrary };
