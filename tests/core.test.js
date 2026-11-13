import test from 'node:test';
import assert from 'node:assert/strict';
import {solve,audit,residual,example,sensitivity,normalize} from '../core.js';

function cuts(n) {
 const middle=n.nodes.filter(v=>v!==n.source&&v!==n.sink);let best=Infinity;
 for(let mask=0;mask<2**middle.length;mask++) {
  const side=new Set([n.source,...middle.filter((_,i)=>mask&(1<<i))]);
  best=Math.min(best,n.edges.reduce((s,e)=>s+(side.has(e.from)&&!side.has(e.to)?e.capacity:0),0));
 }
 return best;
}
test('classic directed network has value 23 and a verifiable cut',()=>{
 const r=solve(example());assert.equal(r.certificate.value,23);assert.equal(r.certificate.cutCapacity,23);
 assert.equal(r.snapshots.length,4);assert.equal(r.certificate.optimal,true);
});
test('a shortest augmentation can undo prior flow without merging opposite arcs',()=>{
 const r=solve(example('reroute'));assert.equal(r.certificate.value,2);
 const last=r.snapshots.at(-1);assert.equal(last.path.filter(a=>a.direction===-1).length,1);
 assert.equal(last.flow[2],0);assert.equal(last.path.find(a=>a.direction===-1).id,'ac');
});
test('500 random multigraphs agree with independently enumerated cuts at every optimum',()=>{
 let seed=731;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let trial=0;trial<500;trial++) {
  const nodes=Array.from({length:2+rand(7)},(_,i)=>'N'+i), edges=[];
  for(let j=0;j<rand(30);j++){const a=rand(nodes.length),b=rand(nodes.length);if(a!==b)edges.push({id:'e'+j,from:nodes[a],to:nodes[b],capacity:rand(12)});}
  const n={nodes,edges,source:nodes[0],sink:nodes.at(-1)},r=solve(n);
  assert.equal(r.certificate.value,cuts(n));
  r.snapshots.forEach((s,i)=>{
   assert.equal(audit(n,s.flow).value,s.value);
   if(i){const before=r.snapshots[i-1],arcs=residual(n,before.flow);let next=n.source;const changed=[...before.flow];
    for(const p of s.path){assert.equal(p.from,next);assert.ok(arcs.some(a=>JSON.stringify(a)===JSON.stringify(p)));changed[p.edge]+=s.delta*p.direction;next=p.to;}
    assert.equal(next,n.sink);assert.deepEqual(changed,s.flow);assert.equal(s.value,before.value+s.delta);
   }
  });
 }
});
test('parallel edges, opposing edges, zero edges, source incoming and sink outgoing remain distinct',()=>{
 const n={nodes:['S','T'],source:'S',sink:'T',edges:[{id:'a',from:'S',to:'T',capacity:3},{id:'b',from:'S',to:'T',capacity:5},{id:'c',from:'T',to:'S',capacity:9},{id:'z',from:'S',to:'T',capacity:0}]};
 assert.deepEqual(solve(n).snapshots.at(-1).flow,[3,5,0,0]);assert.equal(solve(n).certificate.value,8);
});
test('capacity changes match exhaustive cuts, including upgrades that do not help',()=>{
 const n=example();for(const s of sensitivity(n)){const i=n.edges.findIndex(e=>e.id===s.id),x=structuredClone(n);x.edges[i].capacity=0;assert.equal(s.without,cuts(x));x.edges[i].capacity=n.edges[i].capacity+1;assert.equal(s.upgraded,cuts(x));assert.ok(s.gain===0||s.gain===1);}
});
test('certificate rejects infeasible user flows and disconnected graph is certified at zero',()=>{
 const n=example();assert.throws(()=>audit(n,[1]));const f=n.edges.map(()=>0);f[0]=1;assert.throws(()=>audit(n,f),/conservation/);f[0]=17;assert.throws(()=>audit(n,f),/capacity/);
 const empty={nodes:['S','T'],edges:[],source:'S',sink:'T'};assert.equal(solve(empty).certificate.optimal,true);
});
test('validation rejects malformed and oversized studies without mutating inputs',()=>{
 const n=example(),saved=JSON.stringify(n);solve(n);sensitivity(n);assert.equal(JSON.stringify(n),saved);
 for(const capacity of [true,NaN,Infinity,-1,1.5,1000001]){const x=structuredClone(n);x.edges[0].capacity=capacity;assert.throws(()=>normalize(x));}
 assert.throws(()=>normalize({...n,source:'T'}));assert.throws(()=>normalize({...n,nodes:['S','S']}));assert.throws(()=>normalize({...n,edges:[...n.edges,n.edges[0]]}));
});
