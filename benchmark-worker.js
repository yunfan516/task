const names=['直接插入','折半插入','希尔','冒泡','快速','简单选择','堆排序','归并'];
const stable=[true,true,false,true,false,false,false,true];
const distributions=['random','ascending','descending','duplicates'];

function makeData(n,kind){
  if(kind==='ascending')return Int32Array.from({length:n},(_,i)=>i+1);
  if(kind==='descending')return Int32Array.from({length:n},(_,i)=>n-i);
  if(kind==='duplicates')return Int32Array.from({length:n},()=>Math.floor(Math.random()*10));
  return Int32Array.from({length:n},()=>Math.floor(Math.random()*n*10));
}

function measure(e,algorithm,original,data){
  let runs=0,elapsed=0,cElapsed=0,ok=true,cmp=0,mov=0;
  const start=performance.now();
  do{
    data.set(original);
    const sorted=e.sort_run(algorithm,original.length,0)===1;
    cElapsed+=Number(e.elapsed_ms());
    if(runs===0){ok=sorted;cmp=Number(e.comparisons());mov=Number(e.moves());}
    runs++;
    elapsed=performance.now()-start;
  }while(elapsed<8&&runs<256);
  const cAverage=cElapsed/runs;
  return {ms:cAverage>=0.00005?cAverage:elapsed/runs,ok,cmp,mov};
}

self.onmessage=async({data:{n}})=>{
  try{
    const response=await fetch('sort_core.wasm');
    const bytes=await response.arrayBuffer();
    const {instance}=await WebAssembly.instantiate(bytes,{env:{emit_frame:()=>{},high_res_time:()=>performance.now()}});
    const {exports:e}=instance;
    const rows=names.map((name,index)=>({name,stable:stable[index],times:[],cmp:0,mov:0,ok:true}));
    let done=0;
    for(const kind of distributions){
      const original=makeData(n,kind);
      for(let algorithm=0;algorithm<names.length;algorithm++){
        const ptr=e.input_ptr()>>>0;
        const data=new Int32Array(e.memory.buffer,ptr,n);
        const result=measure(e,algorithm,original,data);
        rows[algorithm].times.push(result.ms);
        rows[algorithm].cmp+=result.cmp;
        rows[algorithm].mov+=result.mov;
        rows[algorithm].ok=rows[algorithm].ok&&result.ok;
        self.postMessage({type:'progress',done:++done,total:32});
      }
    }
    self.postMessage({type:'result',rows});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
