export function normalize(input) {
  if (!input || !Array.isArray(input.nodes) || input.nodes.length < 2 || input.nodes.length > 16) throw Error('Use 2–16 nodes.');
  const nodes = input.nodes.map(n => {if(typeof n !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(n)) throw Error('Node IDs must be short ASCII names.'); return n;});
  if(new Set(nodes).size !== nodes.length) throw Error('Node IDs must be unique.');
  if(!nodes.includes(input.source) || !nodes.includes(input.sink) || input.source === input.sink) throw Error('Choose distinct source and sink nodes.');
  if(!Array.isArray(input.edges) || input.edges.length > 64) throw Error('Use at most 64 directed edges.');
  const ids = new Set();
  const edges = input.edges.map(e => {
    if(!e || typeof e.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(e.id) || ids.has(e.id)) throw Error('Edge IDs must be unique short ASCII names.');
    ids.add(e.id);
    if(!nodes.includes(e.from) || !nodes.includes(e.to) || e.from === e.to) throw Error('Edges need two different existing nodes.');
    if(!Number.isSafeInteger(e.capacity) || e.capacity < 0 || e.capacity > 1000000) throw Error('Capacities must be integers from 0 to 1,000,000.');
    return {id:e.id, from:e.from, to:e.to, capacity:e.capacity};
  });
  return {nodes, edges, source:input.source, sink:input.sink};
}

export function residual(network, flow) {
  const arcs=[];
  network.edges.forEach((e,i)=>{
    if(e.capacity > flow[i]) arcs.push({edge:i,id:e.id,from:e.from,to:e.to,capacity:e.capacity-flow[i],direction:1});
    if(flow[i] > 0) arcs.push({edge:i,id:e.id,from:e.to,to:e.from,capacity:flow[i],direction:-1});
  });
  return arcs;
}

function search(network,flow) {
  const arcs=residual(network,flow), seen=new Set([network.source]), queue=[network.source], parent=new Map(), distances={[network.source]:0};
  for(let head=0;head<queue.length;head++) {
    const u=queue[head];
    for(const a of arcs) if(a.from===u && !seen.has(a.to)) {
      seen.add(a.to);parent.set(a.to,a);queue.push(a.to);distances[a.to]=distances[u]+1;
    }
  }
  const path=[];
  if(seen.has(network.sink)) for(let v=network.sink;v!==network.source;) {const a=parent.get(v);path.unshift(a);v=a.from;}
  return {path,reachable:network.nodes.filter(n=>seen.has(n)),distances};
}

export function audit(input,flow) {
  const n=normalize(input);
  if(!Array.isArray(flow) || flow.length!==n.edges.length) throw Error('One flow is required per edge.');
  const balance=Object.fromEntries(n.nodes.map(v=>[v,0]));
  n.edges.forEach((e,i)=>{
    if(!Number.isSafeInteger(flow[i]) || flow[i]<0 || flow[i]>e.capacity) throw Error('Flow violates a capacity.');
    balance[e.from]-=flow[i];balance[e.to]+=flow[i];
  });
  for(const v of n.nodes) if(v!==n.source && v!==n.sink && balance[v]!==0) throw Error('Flow violates conservation.');
  if(balance[n.source]>0 || balance[n.sink]!==-balance[n.source]) throw Error('Invalid source/sink balance.');
  const reachable=search(n,flow).reachable, set=new Set(reachable);
  const cutEdges=n.edges.filter(e=>set.has(e.from)&&!set.has(e.to)).map(e=>e.id);
  const cutCapacity=n.edges.filter(e=>set.has(e.from)&&!set.has(e.to)).reduce((s,e)=>s+e.capacity,0);
  return {value:balance[n.sink],balance,reachable,cutEdges,cutCapacity,optimal:!set.has(n.sink)&&balance[n.sink]===cutCapacity};
}

export function solve(input) {
  const network=normalize(input), flow=network.edges.map(()=>0), snapshots=[];
  let value=0;
  snapshots.push({flow:[...flow],value,path:[],delta:0});
  for(;;) {
    const result=search(network,flow);
    if(!result.path.length) break;
    const delta=Math.min(...result.path.map(a=>a.capacity));
    for(const a of result.path) flow[a.edge]+=delta*a.direction;
    value+=delta;
    snapshots.push({flow:[...flow],value,path:result.path,delta,distances:result.distances});
    if(snapshots.length>16384) throw Error('Augmentation guard exceeded.');
  }
  const certificate=audit(network,flow);
  if(!certificate.optimal) throw Error('Internal certificate failure.');
  return {network,snapshots,certificate};
}

export function sensitivity(input) {
  const n=normalize(input), base=solve(n).certificate.value;
  return n.edges.map((e,i)=>{
    const changed=structuredClone(n);changed.edges[i].capacity=0;
    const without=solve(changed).certificate.value;
    changed.edges[i].capacity=Math.min(1000000,e.capacity+1);
    const upgraded=solve(changed).certificate.value;
    return {id:e.id,without,loss:base-without,upgraded,gain:upgraded-base,upgradeAvailable:e.capacity<1000000};
  });
}

export function example(kind='harbor') {
  if(kind==='reroute') return normalize({nodes:['S','A','B','C','D','T'],source:'S',sink:'T',edges:[['sa','S','A'],['sb','S','B'],['ac','A','C'],['ad','A','D'],['bc','B','C'],['ct','C','T'],['dt','D','T']].map(([id,from,to])=>({id,from,to,capacity:1}))});
  return normalize({nodes:['S','North','South','Mill','Dock','T'],source:'S',sink:'T',edges:[['sn','S','North',16],['ss','S','South',13],['ns','North','South',10],['snr','South','North',4],['nm','North','Mill',12],['ms','Mill','South',9],['sd','South','Dock',14],['dm','Dock','Mill',7],['mt','Mill','T',20],['dt','Dock','T',4]].map(([id,from,to,capacity])=>({id,from,to,capacity}))});
}
