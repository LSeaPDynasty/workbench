const {app,BrowserWindow}=require('electron');
const path=require('node:path');
app.whenReady().then(()=>{const win=new BrowserWindow({width:1320,height:880,minWidth:960,minHeight:640,backgroundColor:'#f5f6f8',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile(path.join(__dirname,'../dist/index.html'));});
app.on('window-all-closed',()=>app.quit());
