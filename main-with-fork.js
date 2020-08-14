const electron = require("electron");
const app = electron.app;
const Menu = electron.Menu;
const MenuItem = electron.MenuItem;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog
const settings = require('electron-settings');
const _ = require("lodash");
const fs = require("fs");
const fixPath = require('fix-path');
fixPath();

let mainWindow;
let nodeServer;
let env = Object.create(process.env);
const { fork } = require("child_process")

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      webviewTag: true
    }
  });
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  mainWindow.webContents.openDevTools();
  mainWindow.on("closed", function() {
    mainWindow = null;
  });
}

app.on("ready", async () => {
  await settings.set('abe', {
    path: '/Users/grg/programmation/git/milka2020-static/specs',
    port: '3000'
  });
  const template = [
    {
      label: 'Edit',
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'pasteandmatchstyle'},
        {role: 'delete'},
        {role: 'selectall'}
      ]
    },
    {
      label: 'Website',
      submenu: [
        {
          label: 'Create a new website',
          click: function() { createWebsite(); }
        },
        {
          label: 'Open local website',
          click: function() { showDirectorySelector(); }
        },
        {
          label: 'Open website on Internet',
          click: function() { showDirectorySelector(); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {role: 'reload'},
        {role: 'forcereload'},
        {role: 'toggledevtools'},
        {type: 'separator'},
        {role: 'resetzoom'},
        {role: 'zoomin'},
        {role: 'zoomout'},
        {type: 'separator'},
        {role: 'togglefullscreen'}
      ]
    },
    {
      role: 'window',
      submenu: [
        {role: 'minimize'},
        {role: 'close'}
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click () { require('electron').shell.openExternal('https://abecms.io') }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {role: 'services', submenu: []},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideothers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'}
      ]
    })

    // Edit menu
    template[1].submenu.push(
      {type: 'separator'},
      {
        label: 'Speech',
        submenu: [
          {role: 'startspeaking'},
          {role: 'stopspeaking'}
        ]
      }
    )

    // Window menu
    template[3].submenu = [
      {role: 'close'},
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'}
    ]
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  launchServer()
  createWindow();
});

app.on("browser-window-created", function(e, window) {
  //window.setMenu(null);
});

app.on("window-all-closed", function() {
  nodeServer.stdin.pause();
  console.log("let's kill: "+nodeServer.pid)
  process.kill(nodeServer.pid);
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function() {
  if (mainWindow === null) {
    createWindow();
  }
});

function createWebsite() {
  var options = {
      title: "Create a directory",
      properties: ['openDirectory', 'createDirectory'],
  }
  dialog.showOpenDialog(mainWindow, options).then( result => {
    if (result.filePaths && result.filePaths.length > 0) {
      mainWindow.webContents.send('project-directory-selected', result.filePaths[0]);
      settings.setSync('abe.path', result.filePaths[0]);
    }
  }).catch(err => {
    console.log(err)
  })
}

function saveFile() {
  let content = "Some text to save into the file";
  dialog.showSaveDialog((fileName) => {
    if (fileName === undefined){
      console.log("You didn't save the file");
      return;
    }

    // fileName is a string that contains the path and filename created in the save file dialog.
    fs.writeFile(fileName, content, (err) => {
      if(err){
          alert("An error ocurred creating the file "+ err.message)
      }

      alert("The file has been succesfully saved");
    });
  });
}

exports.reload = function () {
  nodeServer.stdin.pause();
  console.log("let's kill: "+nodeServer.pid)
  process.kill(nodeServer.pid);
  launchServer();
  mainWindow.loadURL(`file://${__dirname}/index.html`);
}

exports.redirectOutput = function(x) {
  let lineBuffer = "";
  let output
  if(x == 'stdout')
    output = nodeServer.stdout
  if(x == 'stderr')
    output = nodeServer.stderr

  output.on('data', function (data) {
    lineBuffer += data.toString();
    let lines = lineBuffer.split("\n");

    _.forEach(lines, (l) => {
      if (l !== "") {
        if(mainWindow != null && mainWindow.webContents != null)
          mainWindow.webContents.send('server-log', strip(l));
      }
    });

    lineBuffer = lines[lines.length - 1];
  });
}

function showDirectorySelector() {
  var options = {
      title: "Select Directory",
      properties: ['openDirectory'],
  }
  dialog.showOpenDialog(mainWindow, options).then( result => {
    if (result.filePaths && result.filePaths.length > 0) {
      mainWindow.webContents.send('project-directory-selected', result.filePaths[0]);
      settings.setSync('abe.path', result.filePaths[0]);
    }
  }).catch(err => {
    console.log(err)
  })
}

function strip(s) {
  // regex from: http://stackoverflow.com/a/29497680/170217
  return s.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

const launchServer = () => {
  env.ROOT = settings.getSync('abe.path');
  console.log('env.ROOT', env.ROOT);
  // For electron-packager change cwd in spawn to app.getAppPath() and
  // uncomment the app require below
  //nodeServer = spawn("node", ["./node_modules/abecms/dist/server/index.js"], { env: env, cwd: app.getAppPath() })

  // dev
  //console.log('cwd', process.cwd());

  //nodeServer = spawn("node", ["./node_modules/abecms/dist/server/index.js"], { env: env, cwd: app.getAppPath() });
  nodeServer = fork("./node_modules/abecms/dist/server/index.js", { env: env, cwd: app.getAppPath(), silent: true });
  console.log("nouvelle instance:"+nodeServer.pid);
}
