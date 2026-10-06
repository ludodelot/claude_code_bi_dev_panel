// Renders extension/panel.js with mock data into tools/preview-<theme>.html (open it in a browser).
// Usage: node tools/preview.js dark|light
const fs=require('fs'),os=require('os'),path=require('path')
const {panelHtml}=require(path.join(__dirname,'..','extension','panel.js'))
const theme=process.argv[2]||'dark'
const real={cwd:'C:/demo/sales-dashboard',desktopOpen:false}
const now=Date.now()
const state={...real,updatedAt:now-4000,startedAt:now-95*60000,usd:2.37,contextPercent:47,
 totals:{input:3200,output:41800,cacheRead:2850000,cacheWrite:186000},
 limits:[{kind:'five_hour',percentUsed:68,resetsAt:new Date(now+2.2*3600000).toISOString()},{kind:'seven_day',percentUsed:31,resetsAt:new Date(now+4.5*86400000).toISOString()}],
 changes:[{t:now-300000,tool:'Edit',kind:'model',area:'Sales.SemanticModel/definition/tables/Measures.tmdl',edited:1,added:3},{t:now-900000,tool:'Write',kind:'report',area:'Sales.Report/report.json',edited:0,added:0}],
 workspaces:[{key:'a',dir:'C:/x',repoRoot:'C:/x',branch:'main',githubSlug:'ludovic/sales-dash',dirty:3,ahead:1,behind:0,lastCommit:'feat: add margin KPI',pbip:['Sales.pbip'],modelStats:[{name:'Sales.SemanticModel',tables:12,measures:48,relationships:9}],reports:[{name:'Sales.Report',pages:6,model:'Sales.SemanticModel'}]}]}
const fr=new Date(now+2.2*3600000).toISOString(),sr=new Date(now+4.5*86400000).toISOString()
const history=[]
for(let i=0;i<60;i++){const t=now-(95-i*1.6)*60000;const k=i/59;history.push({t,f:Math.round(8+k*60+Math.sin(i/4)*2),fr,s:Math.round(20+k*11),sr,c:Math.round(5+k*42+Math.sin(i/3)*3),u:+(k*2.37).toFixed(2)})}
const T=(i,o,cr,cw)=>({input:i,output:o,cacheRead:cr,cacheWrite:cw})
const activity={scannedAt:now,sessions:[{id:'s1',title:'Sales dashboard refactor',active:true,latest:now,workspace:{dir:'C:/x/sales-dashboard',cwd:'C:/x',repoRoot:'C:/x/sales-dashboard',repoName:'sales-dashboard',branch:'main',githubSlug:'ludovic/sales-dash',pbipDir:'C:/x/sales-dashboard',pbip:['Sales.pbip'],models:['Sales.SemanticModel'],reports:['Sales.Report'],hasPbi:true},tasks:[
 {id:'t1',t:now-80*60000,title:'Add margin KPI measures to the Sales semantic model',tokens:T(40,5200,820000,61000),burned:66240,tools:22},
 {id:'t2',t:now-50*60000,title:'Fix the broken relationship between Dim Date and Fact Sales',tokens:T(12,2100,410000,30000),burned:32112,tools:11},
 {id:'t3',t:now-20*60000,title:'Redesign the usage panel with charts and flow map',tokens:T(30,9800,1420000,95000),burned:104830,tools:41}]}],
 agents:[
 {id:'a1',sessionId:'s1',sessionTitle:'Sales dashboard refactor',description:'Explore semantic model measures',type:'Explore',depth:1,model:'claude-sonnet-5',status:'running',start:now-130000,last:now-3000,tokens:T(8,2400,310000,22000),tools:14,lastTool:'Grep · measure\s.*Margin',burned:24408},
 {id:'a2',sessionId:'s1',sessionTitle:'Sales dashboard refactor',description:'Review TMDL changes for regressions',type:'code-reviewer',depth:1,model:'claude-opus-5-5',status:'running',start:now-45000,last:now-1000,tokens:T(6,900,120000,15000),tools:5,lastTool:'Read · Measures.tmdl',burned:15906},
 {id:'a3',sessionId:'s1',sessionTitle:'Sales dashboard refactor',description:'Write unit tests for DAX helpers',type:'tdd-guide',depth:1,model:'claude-sonnet-5',status:'done',start:now-30*60000,last:now-22*60000,tokens:T(10,6100,520000,40000),tools:19,lastTool:'Write · dax.test.ts',burned:46110},
 {id:'a4',sessionId:'s1',sessionTitle:'Sales dashboard refactor',description:'Scan repo for secrets',type:'security-reviewer',depth:1,model:'claude-haiku-4-5',status:'stale',start:now-3*3600000,last:now-2.9*3600000,tokens:T(3,700,60000,9000),tools:6,lastTool:'Grep · api_key',burned:9703}]}
let html=panelHtml()
const stub=`window.acquireVsCodeApi=()=>({postMessage:m=>{if(m==='ready')setTimeout(()=>window.postMessage(${JSON.stringify({state,history,user:'Ludovic',activity})},'*'),50)}});`
html=html.replace(/(<script nonce="[^"]+">)/,'$1'+stub)
const bg=theme==='dark'?'#1e1e1e':'#ffffff',fg=theme==='dark'?'#cccccc':'#333333'
html=html.replace('<body>',`<body class="vscode-${theme}" style="background:${bg};--vscode-editor-foreground:${fg};--vscode-foreground:${fg};--vscode-editor-background:${bg};--vscode-font-family:Segoe UI,sans-serif">`)
fs.writeFileSync(path.join(__dirname,`preview-${theme}.html`),html)
