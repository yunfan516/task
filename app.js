const algorithms = [
  {id:'insert',name:'直接插入',complexity:'O(n²)',stable:true,description:'将当前元素插入前方有序区间。对接近有序的数据效率较高。'},
  {id:'binary',name:'折半插入',complexity:'O(n²)',stable:true,description:'用二分查找确定插入位置，减少查找比较，但元素移动量仍为 O(n²)。'},
  {id:'shell',name:'希尔',complexity:'依赖增量序列',stable:false,description:'按逐渐缩小的间隔进行分组插入排序，增量序列会影响实际复杂度。'},
  {id:'bubble',name:'冒泡',complexity:'O(n²)',stable:true,description:'重复比较相邻元素并交换逆序对；加入提前结束判断后，正序输入只需一轮。'},
  {id:'quick',name:'快速',complexity:'O(n log n)',stable:false,description:'使用三数取中选择枢轴并进行分区；小分区切换到插入排序。'},
  {id:'selection',name:'简单选择',complexity:'O(n²)',stable:false,description:'每轮选出剩余区间最小元素放到前端，比较次数固定，交换次数较少。'},
  {id:'heap',name:'堆排序',complexity:'O(n log n)',stable:false,description:'构建最大堆后逐次取出堆顶，时间复杂度稳定在 O(n log n)。'},
  {id:'merge',name:'归并',complexity:'O(n log n)',stable:true,description:'递归排序左右区间后合并，使用额外空间换取稳定的 O(n log n) 时间。'}
];
const eventNames=['开始排序','插入元素','间隔插入','交换相邻元素','快速分区','放置区间最小值','最大值移至末尾','合并有序区间','排序完成'];
let cSources=[
`void insertionSort(int a[], int n) {
    int i, j, value;
    for (i = 1; i < n; ++i) {
        value = a[i];
        j = i;
        while (j > 0 && a[j - 1] > value) {
            a[j] = a[j - 1];
            --j;
        }
        a[j] = value;
    }
}`,
`void binaryInsertionSort(int a[], int n) {
    int i, lo, hi, mid, j, value;
    for (i = 1; i < n; ++i) {
        value = a[i];
        lo = 0; hi = i;
        while (lo < hi) {
            mid = lo + (hi - lo) / 2;
            if (a[mid] > value) hi = mid;
            else lo = mid + 1;
        }
        for (j = i; j > lo; --j) a[j] = a[j - 1];
        a[lo] = value;
    }
}`,
`void shellSort(int a[], int n) {
    int gap, i, j, value;
    for (gap = n / 2; gap > 0; gap /= 2) {
        for (i = gap; i < n; ++i) {
            value = a[i];
            for (j = i; j >= gap && a[j-gap] > value; j -= gap)
                a[j] = a[j-gap];
            a[j] = value;
        }
    }
}`,
`void bubbleSort(int a[], int n) {
    int i, j, temp;
    bool swapped;
    for (i = 0; i < n - 1; ++i) {
        swapped = false;
        for (j = 0; j < n - i - 1; ++j) {
            if (a[j] > a[j + 1]) {
                temp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = temp;
                swapped = true;
            }
        }
        if (!swapped) break;
    }
}`,
`static void quickSort(int a[], int lo, int hi) {
    while (hi - lo > 16) {
        int mid = lo + (hi - lo) / 2;
        int pivot = median(a[lo], a[mid], a[hi]);
        int i = lo, j = hi;
        while (i <= j) {
            while (a[i] < pivot) ++i;
            while (a[j] > pivot) --j;
            if (i <= j) {
                swap(&a[i], &a[j]);
                ++i; --j;
            }
        }
        if (j - lo < hi - i) {
            if (lo < j) quickSort(a, lo, j);
            lo = i;
        } else {
            if (i < hi) quickSort(a, i, hi);
            hi = j;
        }
    }
    insertionSortRange(a, lo, hi);
}`,
`void selectionSort(int a[], int n) {
    int i, j, min, temp;
    for (i = 0; i < n - 1; ++i) {
        min = i;
        for (j = i + 1; j < n; ++j)
            if (a[j] < a[min]) min = j;
        if (min != i) {
            temp = a[i];
            a[i] = a[min];
            a[min] = temp;
        }
    }
}`,
`void heapSort(int a[], int n) {
    int i, temp;
    for (i = n / 2 - 1; i >= 0; --i)
        siftDown(a, i, n - 1);
    for (i = n - 1; i > 0; --i) {
        temp = a[0]; a[0] = a[i]; a[i] = temp;
        siftDown(a, 0, i - 1);
    }
}`,
`void mergeSort(int a[], int temp[], int lo, int hi) {
    if (lo >= hi) return;
    int mid = lo + (hi - lo) / 2;
    mergeSort(a, temp, lo, mid);
    mergeSort(a, temp, mid + 1, hi);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi)
        temp[k++] = a[i] <= a[j] ? a[i++] : a[j++];
    while (i <= mid) temp[k++] = a[i++];
    while (j <= hi) temp[k++] = a[j++];
    for (i = lo; i <= hi; ++i) a[i] = temp[i];
}`
];
const codeGroups=[['insertion_range','insertion_sort'],['binary_insertion_sort'],['shell_sort'],['bubble_sort'],['quick_sort_range','quick_sort'],['selection_sort'],['sift_down','heap_sort'],['merge_range','merge_sort_range']];
let wasm=null, benchmarkWorker=null, selected=0, initial=[], frames=[], frameIndex=0, timer=null, algoMs=0, measuredStable=[];
const $=id=>document.getElementById(id);

function extractCFunction(source,name){
  const pattern=new RegExp(`(?:static\\s+)?(?:void|int|double)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match=pattern.exec(source);if(!match)throw new Error(`C 源码中未找到 ${name}`);
  const open=match.index+match[0].lastIndexOf('{');let depth=0;
  for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(match.index,i+1);}
  throw new Error(`C 函数 ${name} 缺少结束括号`);
}
function loadCSource(source){cSources=codeGroups.map(group=>group.map(name=>extractCFunction(source,name)).join('\n\n'));}

function renderAlgorithms(){
  $('algorithmSelect').innerHTML=algorithms.map((a,i)=>`<option value="${i}">${a.name}${a.name.endsWith('排序')?'':'排序'} · ${a.complexity}</option>`).join('');
  $('algorithmSelect').value=selected;
  $('referenceGrid').innerHTML=algorithms.map(a=>`<article class="reference-card"><strong>${a.name}</strong><span class="stable-tag ${a.stable?'':'unstable'}">${a.stable?'稳定':'不稳定'}</span><span>${a.complexity}</span></article>`).join('');
}
function chooseAlgorithm(id){selected=id;renderAlgorithms();renderCode();const stableNow=measuredStable.length?measuredStable[id]:algorithms[id].stable;$('stabilityValue').textContent=stableNow?'稳定':'不稳定';$('stabilityValue').className='metric-value stability-value '+(stableNow?'yes':'no');prepare();}
function readInput(){const vals=$('arrayInput').value.split(/[,，\s]+/).filter(Boolean).map(Number);if(!vals.length||vals.some(x=>!Number.isInteger(x)||x<0)||vals.length>50){alert('请输入 1 至 50 个非负整数，用逗号或空格分隔。');return null;}return vals;}
function wasmInput(n){const ptr=wasm.exports.input_ptr()>>>0;return new Int32Array(wasm.exports.memory.buffer,ptr,n);}
function wasmRecords(){const ptr=wasm.exports.records_ptr()>>>0;return new Int32Array(wasm.exports.memory.buffer,ptr,initial.length*2);}
function snapshot(active,eventCode){const data=wasmRecords(),a=[];for(let i=0;i<initial.length;i++)a.push({key:data[i*2],id:data[i*2+1]});frames.push({a,active,eventCode,event:eventNames[eventCode]||'排序过程',cmp:Number(wasm.exports.comparisons()),mov:Number(wasm.exports.moves())});}
function drawBars(arr,active=-1,eventCode=0){const max=Math.max(1,...arr.map(x=>x.key));$('barChart').innerHTML=arr.map((x,i)=>{const compared=eventCode===3&&(i===active||i===active+1);return `<div class="bar-wrap"><span class="bar-value">${x.key}</span><div class="bar ${compared?'is-compare':i===active?'is-active':''}" style="height:${Math.max(3,Math.round(x.key/max*78))}%" title="${x.key} · #${x.id+1}"></div></div>`;}).join('');$('barAxis').innerHTML=arr.map((_,i)=>`<span>${i}</span>`).join('');$('arraySize').textContent=arr.length+' 个元素';}
function codeLineFor(eventCode){const lines=cSources[selected].split('\n');if(eventCode===0)return 1;if(eventCode===8)return lines.length;const targets=[null,/while \(j > lo/,/for \(j = i; j > lo/,/for \(j = i; j >= gap/,/if \(compare_record\(a\[i\], a\[i \+ 1\]\)/,/if \(i <= j\)/,/if \(min != i\)/,/swap_records\(a, 0, i\)/,/frame\(mid, 7\)/];const targetIndex={1:selected===1?2:1,2:3,3:4,4:5,5:6,6:7,7:8}[eventCode];const line=lines.findIndex(text=>targets[targetIndex]?.test(text));return line>=0?line+1:1;}
function escapeHtml(text){return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderCode(activeLine=1){const lines=cSources[selected].split('\n');$('codeEditor').innerHTML=lines.map((line,i)=>`<div class="code-line ${i+1===activeLine?'current':''}" id="code-line-${i+1}"><span class="line-number">${i+1}</span><code>${highlightC(line)}</code></div>`).join('');const current=$('code-line-'+activeLine);if(current)current.scrollIntoView({block:'nearest'});}
function highlightC(line){let html=escapeHtml(line);html=html.replace(/(\/\/.*$)/g,'<span class="syntax-comment">$1</span>');html=html.replace(/\b(void|int|bool|if|else|while|for|return|true|false)\b/g,'<span class="syntax-keyword">$1</span>');html=html.replace(/\b([A-Za-z_]\w*)(?=\s*\()/g,'<span class="syntax-function">$1</span>');html=html.replace(/\b(\d+)\b/g,'<span class="syntax-number">$1</span>');return html||'&nbsp;';}
function frameDescription(eventCode){const name=algorithms[selected].name.endsWith('排序')?algorithms[selected].name:`${algorithms[selected].name}排序`;if(eventCode===0)return `开始${name}`;if(eventCode===8)return `${name}完成`;return eventNames[eventCode]||'排序过程';}
function updateFrame(){const f=frames[frameIndex];if(!f)return;const activeLine=codeLineFor(f.eventCode);drawBars(f.a,f.active,f.eventCode);$('compareCount').textContent=f.cmp.toLocaleString();$('moveCount').textContent=f.mov.toLocaleString();$('stepLabel').textContent=`第 ${frameIndex} 步`; $('stepCount').textContent=`${frameIndex}/${frames.length-1}`;$('progressSlider').max=frames.length-1;$('progressSlider').value=frameIndex;$('progressSlider').style.setProperty('--progress',`${frames.length>1?100*frameIndex/(frames.length-1):0}%`);$('eventLabel').textContent=f.event;$('codeCurrentLine').textContent=`当前高亮行：${activeLine}（${frameDescription(f.eventCode)}）`;renderCode(activeLine);$('elapsedTime').textContent=formatMs(algoMs);if(frameIndex===frames.length-1){stopPlayback();$('stateText').textContent='排序完成';$('stateDot').parentElement.className='chart-state done';$('playLabel').textContent='播放';$('playBtn').querySelector('.play-symbol').textContent='▶';}}
function stopPlayback(){if(timer){clearInterval(timer);timer=null;}if($('playBtn')){$('playLabel').textContent='继续排序';$('playBtn').querySelector('.play-symbol').textContent='▶';}}
function formatMs(ms){if(!(ms>0))return '0.0000';return ms<1?ms.toFixed(4):ms.toFixed(2);}
function fillInput(values){const data=wasmInput(values.length);for(let i=0;i<values.length;i++)data[i]=values[i];}
function measureAverage(values){const start=performance.now();let runs=0,elapsed=0;do{fillInput(values);wasm.exports.sort_run(selected,values.length,0);runs++;elapsed=performance.now()-start;}while(elapsed<12&&runs<10000);return elapsed/runs;}
function prepare(){
  if(!wasm)return false;
  const values=readInput();if(!values)return false;
  stopPlayback();initial=values;frames=[];
  algoMs=measureAverage(values);
  fillInput(values);
  $('stateText').textContent='准备就绪';$('stateDot').parentElement.className='chart-state';$('elapsedTime').textContent=formatMs(algoMs);$('playLabel').textContent='播放';$('playBtn').querySelector('.play-symbol').textContent='▶';
  wasm.exports.sort_run(selected,values.length,1);
  frameIndex=0;if(!frames.length)snapshot(-1,8);updateFrame();return true;
}
function advance(){if(frameIndex<frames.length-1){frameIndex++;updateFrame();}else stopPlayback();}
function speedDelay(){return [900,620,380,220,100][Number($('speedSlider').value)-1]||380;}
function togglePlayback(){if(frameIndex>=frames.length-1)prepare();if(timer){stopPlayback();$('stateText').textContent='已暂停';$('stateDot').parentElement.className='chart-state';return;}$('stateText').textContent='正在排序';$('stateDot').parentElement.className='chart-state running';$('playLabel').textContent='暂停';$('playBtn').querySelector('.play-symbol').textContent='Ⅱ';timer=setInterval(advance,speedDelay());}
function randomize(){const n=7,values=Array.from({length:n},()=>Math.floor(Math.random()*90)+1);$('arrayInput').value=values.join(', ');prepare();}
function runBenchmark(){const n=Number($('sizeSelect').value);if(n>=50000&&!confirm('该规模下插入、冒泡和选择排序可能需要较长时间。测试会在后台运行，仍可随时停止。继续吗？'))return;if(benchmarkWorker)benchmarkWorker.terminate();benchmarkWorker=new Worker('benchmark-worker.js');$('benchmarkBtn').disabled=false;$('benchmarkBtn').textContent='停止对比';const finish=()=>{if(benchmarkWorker){benchmarkWorker.terminate();benchmarkWorker=null;}$('benchmarkBtn').onclick=runBenchmark;$('benchmarkBtn').innerHTML='<span>▶</span> 运行 8×4 对比';};$('benchmarkBtn').onclick=()=>{finish();$('benchmarkBody').innerHTML='<tr class="empty-row"><td colspan="8">基准已停止</td></tr>';};$('benchmarkBody').innerHTML='<tr class="empty-row"><td colspan="8">正在后台运行 C 排序基准…</td></tr>';benchmarkWorker.onmessage=({data})=>{if(data.type==='progress'){$('benchmarkBody').innerHTML=`<tr class="empty-row"><td colspan="8">已完成 ${data.done} / 32 项测试</td></tr>`;return;}if(data.type==='error'){$('benchmarkBody').innerHTML=`<tr class="empty-row"><td colspan="8">基准运行失败：${data.message}</td></tr>`;finish();return;}if(data.type==='result'){$('benchmarkBody').innerHTML=data.rows.map(row=>`<tr><td>${row.name}</td><td>${row.stable?'稳定':'不稳定'}</td>${row.times.map(ms=>`<td>${ms.toFixed(4)} ms</td>`).join('')}<td>${row.cmp.toLocaleString()} / ${row.mov.toLocaleString()}</td><td><span class="check-pill">${row.ok?'✓ 通过':'× 失败'}</span></td></tr>`).join('');finish();}};benchmarkWorker.onerror=event=>{$('benchmarkBody').innerHTML=`<tr class="empty-row"><td colspan="8">基准运行失败：${event.message}</td></tr>`;finish();};benchmarkWorker.postMessage({n});}
function checkStability(){measuredStable=algorithms.map((a,i)=>wasm.exports.stability_run(i)===1);if(!measuredStable.every((stable,i)=>stable===algorithms[i].stable))throw new Error('C 核心稳定性结果与算法说明不一致');}
async function init(){renderAlgorithms();try{const response=await fetch('sort_core.wasm');if(!response.ok)throw new Error('WASM 模块加载失败');const bytes=await response.arrayBuffer();try{const sourceResponse=await fetch('sort_core.c');if(sourceResponse.ok)loadCSource(await sourceResponse.text());else console.warn('sort_core.c 不可用（HTTP '+sourceResponse.status+'），代码面板使用内置简化版');}catch(sourceError){console.warn('C 源码加载失败，代码面板使用内置简化版',sourceError);}const result=await WebAssembly.instantiate(bytes,{env:{emit_frame:(active,eventCode)=>snapshot(active,eventCode),high_res_time:()=>performance.now()}});wasm=result.instance;checkStability();$('stateText').textContent='C / WebAssembly 已就绪';$('applyInputBtn').onclick=()=>{if(prepare())$('stateText').textContent='数据已更新';};$('randomBtn').onclick=randomize;$('resetBtn').onclick=prepare;$('stepBtn').onclick=()=>{stopPlayback();advance();};$('stepBackBtn').onclick=()=>{stopPlayback();frameIndex=Math.max(0,frameIndex-1);updateFrame();};$('playBtn').onclick=togglePlayback;$('algorithmSelect').onchange=()=>chooseAlgorithm(Number($('algorithmSelect').value));$('progressSlider').oninput=()=>{stopPlayback();frameIndex=Number($('progressSlider').value);updateFrame();};$('speedSlider').oninput=()=>{ $('speedValue').textContent=$('speedSlider').value;if(timer){clearInterval(timer);timer=setInterval(advance,speedDelay());}};$('benchmarkBtn').onclick=runBenchmark;chooseAlgorithm(3);}catch(error){$('stateText').textContent='C 模块加载失败';$('eventLabel').textContent=error.message;console.error(error);}}
init();
