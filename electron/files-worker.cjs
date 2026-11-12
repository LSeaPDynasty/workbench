const {parentPort,workerData}=require('node:worker_threads');
const {FileService}=require('./file-service.cjs');
const service=new FileService(workerData.config);const ready=service.init();
const allowed=new Set(['listRoots','add','change','remove','list','describe','grant','read','resolve','revokePlugin']);
parentPort.on('message',async({id,method,args})=>{try{await ready;if(!allowed.has(method))throw Error('未知方法');parentPort.postMessage({id,data:await service[method](...args)});}catch(e){parentPort.postMessage({id,error:e.message});}});
