'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chargingProgram,emptyProgram,block,num}=require('../electron/program-schema.cjs');
const {validateProgram}=require('../electron/program-engine.cjs');
async function canvas(program) {
  const {Blockly}=await import('../src/program/blocks.mjs');
  const codec=await import('../src/program/codec.mjs');
  const workspace=new Blockly.Workspace();workspace.ridenDevices=program.devices;workspace.ridenParameters=program.parameters;workspace.ridenProcedures=program.procedures||[];
  Blockly.serialization.workspaces.load(codec.programWorkspace(program),workspace);
  return {Blockly,workspace,...codec};
}

test('Scratch canvas round trips the complete charge graph without altering control semantics',async()=>{
  const p=chargingProgram();const {workspace,workspaceProgram,Blockly}=await canvas(p);
  try {
    assert.deepEqual(workspaceProgram(workspace),p.blocks);
    const saved=Blockly.serialization.workspaces.save(workspace);
    const w2=new Blockly.Workspace();w2.ridenDevices=p.devices;w2.ridenParameters=p.parameters;
    try {Blockly.serialization.workspaces.load(saved,w2);assert.deepEqual(workspaceProgram(w2),p.blocks);}finally{w2.dispose();}
  }finally{workspace.dispose();}
});

test('C-shaped if, loop and parallel branches preserve nested device actions',async()=>{
  const p=emptyProgram();p.devices.push({key:'other',label:'电源 B'});
  const parallel=block('parallel');parallel.branches=[[block('output')],[block('output','other')],[]];
  const condition={kind:'binary',op:'>',left:{kind:'telemetry',device:'supply',field:'v'},right:num(2)};
  p.blocks=[{...block('if'),condition,then:[{...block('repeat'),body:[block('wait')]}],else:[{...block('repeat'),condition,body:[block('log')]}]},parallel,block('ramp')];
  const {workspace,workspaceProgram}=await canvas(p);
  try{const compiled=workspaceProgram(workspace);assert.deepEqual(compiled,p.blocks);assert.doesNotThrow(()=>validateProgram({...p,blocks:compiled}));}finally{workspace.dispose();}
});

test('floating blocks are drafts; empty sockets and duplicate start hats prevent execution',async()=>{
  const p=emptyProgram();p.blocks=[block('wait')];const {workspace,workspaceProgram}=await canvas(p);
  try{
    workspace.newBlock('riden_set');assert.deepEqual(workspaceProgram(workspace),p.blocks);
    const wait=workspace.getBlockById(p.blocks[0].id);wait.getInputTargetBlock('SECONDS').dispose();assert.throws(()=>workspaceProgram(workspace),/空槽/);
    workspace.newBlock('riden_start');assert.throws(()=>workspaceProgram(workspace),/只需一个/);
  }finally{workspace.dispose();}
});

test('disabled action blocks never execute and disabled values cannot silently supply data',async()=>{
  const p=emptyProgram();p.blocks=[block('set'),block('wait')];const {workspace,workspaceProgram}=await canvas(p);
  try{
    const set=workspace.getBlockById(p.blocks[0].id);set.setDisabledReason(true,'user');
    assert.deepEqual(workspaceProgram(workspace),[p.blocks[1]]);
    set.setDisabledReason(false,'user');set.getInputTargetBlock('V').setDisabledReason(true,'user');
    assert.throws(()=>workspaceProgram(workspace),/停用/);
  }finally{workspace.dispose();}
});

test('all extended action and expression blocks round trip, including custom hats, text and typed lists',async()=>{
  const p=emptyProgram();
  const actionTypes=['single','adjust','recall','savePreset','backlight','resetStats','readBattery','change','timerReset','listClear','listAppend','listSet','listDelete','for','forever','repeatUntil','assert','logText'];
  p.blocks=actionTypes.map(t=>block(t));
  p.blocks.find(b=>b.type==='forever').body=[block('break')];
  p.blocks.find(b=>b.type==='for').body=[block('continue')];
  p.blocks.find(b=>b.type==='assert').condition={kind:'state',device:'supply',field:'cv'};
  const expressions=[
    {kind:'unary',op:'abs',value:num(-5)},{kind:'not',value:num(0)},
    {kind:'clamp',value:num(3),min:num(0),max:num(5)},
    {kind:'between',value:num(3),min:num(0),max:num(5)},
    {kind:'map',value:num(3),fromMin:num(0),fromMax:num(5),toMin:num(0),toMax:num(10)},
    {kind:'random',min:num(1),max:num(10),integer:true},
    {kind:'approx',left:num(1),right:num(1),tolerance:num(0.01)},
    {kind:'choose',condition:num(1),then:num(2),else:num(3)},
    {kind:'constant',name:'pi'},{kind:'timer',name:'计时器'},
    {kind:'limit',device:'supply',field:'vMax'},
    {kind:'listItem',name:'数据',index:num(1)},{kind:'listStat',name:'数据',op:'mean'},
  ];
  p.blocks.push(...expressions.map(value=>({...block('variable'),value})));
  p.blocks.push({...block('logText'),value:{kind:'join',left:{kind:'text',value:'结果'},right:{kind:'format',value:num(3.14),digits:num(2)}}});
  p.procedures=[{id:'custom-definition',name:'通用动作',body:[block('wait')]}];p.blocks.push({...block('call'),name:'通用动作'});
  const {workspace,workspaceDefinition}=await canvas(p);
  try{const actual=workspaceDefinition(workspace);assert.deepEqual(actual.blocks,p.blocks);assert.deepEqual(actual.procedures,p.procedures);assert.doesNotThrow(()=>validateProgram({...p,...actual}));}finally{workspace.dispose();}
});

test('every static toolbox block can be created with its intended defaults',async()=>{
  const {Blockly,toolbox}=await import('../src/program/blocks.mjs');const ws=new Blockly.Workspace();ws.ridenDevices=[{key:'supply',label:'电源 A'}];ws.ridenParameters=[];
  try{let count=0;for(const category of toolbox.contents)for(const item of category.contents||[])if(item.kind==='block'){Blockly.serialization.blocks.append(item,ws);count++;}assert.ok(count>=50);}finally{ws.dispose();}
});

test('general sweep and two-device tracking examples preserve all blocks and reusable definitions',async()=>{
  const {sweepProgram,trackingProgram}=require('../electron/program-schema.cjs');
  for(const p of [sweepProgram(),trackingProgram()]){
    const {workspace,workspaceDefinition}=await canvas(p);
    try{const actual=workspaceDefinition(workspace);assert.deepEqual(actual.blocks,p.blocks);assert.deepEqual(actual.procedures,p.procedures||[]);assert.doesNotThrow(()=>validateProgram({...p,...actual}));}finally{workspace.dispose();}
  }
});
