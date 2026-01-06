const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn, exec } = require('child_process')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { v4: uuid } = require('uuid')
const db = require('./db')

let mainWindow = null

// Get the bin directory (works in dev and production)
function getBinPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin')
  }
  return path.join(__dirname, 'bin')
}

// Get bundled tool path
function getBundledTool(name) {
  const binDir = getBinPath()
  const ext = process.platform === 'win32' ? '.exe' : ''
  const toolPath = path.join(binDir, name + ext)
  
  if (fs.existsSync(toolPath)) {
    return toolPath
  }
  return null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  db.init()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Check if a command exists in PATH
function checkCommand(cmd) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    exec(command, (error) => {
      resolve(!error)
    })
  })
}

// Get the command to use - bundled first, then PATH
function getToolPath(tool) {
  // Check bundled first
  const bundled = getBundledTool(tool)
  if (bundled) return bundled
  
  // Fallback to system PATH
  return tool
}

// IPC: Check dependencies
ipcMain.handle('check-dependencies', async () => {
  const ytdlpBundled = getBundledTool('yt-dlp')
  const ffmpegBundled = getBundledTool('ffmpeg')
  
  let ytdlp = !!ytdlpBundled
  let ffmpeg = !!ffmpegBundled
  
  // If not bundled, check system PATH
  if (!ytdlp) ytdlp = await checkCommand('yt-dlp')
  if (!ffmpeg) ffmpeg = await checkCommand('ffmpeg')
  
  return { 
    ytdlp, 
    ffmpeg,
    ytdlpBundled: !!ytdlpBundled,
    ffmpegBundled: !!ffmpegBundled
  }
})

// IPC: Open external URL
ipcMain.handle('open-external', (e, url) => {
  shell.openExternal(url)
})

// IPC Handlers
ipcMain.handle('select-vault', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths[0]) {
    db.setSetting('vaultPath', result.filePaths[0])
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('get-vault', () => db.getSettings().vaultPath)
ipcMain.handle('get-items', () => db.getAllItems())

ipcMain.handle('delete-item', (e, id) => {
  const items = db.getAllItems()
  const item = items.find(i => i.id === id)
  if (item && item.filePath && fs.existsSync(item.filePath)) {
    fs.unlinkSync(item.filePath)
  }
  db.deleteItem(id)
  return true
})

ipcMain.handle('open-file', (e, filePath) => {
  shell.openPath(filePath)
})


ipcMain.handle('download-youtube', async (e, url, format = 'video') => {
  const vaultPath = db.getSettings().vaultPath
  if (!vaultPath) return { success: false, error: 'No vault selected' }

  const ytdlpPath = getToolPath('yt-dlp')
  const ffmpegPath = getToolPath('ffmpeg')
  const ffmpegDir = path.dirname(ffmpegPath)
  
  const isAudioOnly = format === 'audio'

  return new Promise((resolve) => {
    const outputTemplate = path.join(vaultPath, '%(title)s.%(ext)s')
    let args = []
    
    if (isAudioOnly) {
      // Audio only - extract to MP3
      args = [
        '-x',  // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '0',  // Best quality
        '-o', outputTemplate,
        '--write-thumbnail',
        '--convert-thumbnails', 'jpg',
        '--no-playlist',
        '--print', 'after_move:filepath',
        '--print', 'title'
      ]
    } else {
      // Video + Audio
      args = [
        '-f', 'bv*+ba/b',  // best video + best audio, or best combined
        '--merge-output-format', 'mp4',
        '--audio-format', 'aac',
        '--postprocessor-args', 'ffmpeg:-c:a aac -b:a 192k',
        '-o', outputTemplate,
        '--write-thumbnail',
        '--convert-thumbnails', 'jpg',
        '--no-playlist',
        '--print', 'after_move:filepath',
        '--print', 'title'
      ]
    }
    
    // Add ffmpeg location if we have a bundled/custom path
    if (ffmpegPath !== 'ffmpeg') {
      args.push('--ffmpeg-location', ffmpegDir)
    }
    
    args.push(url)
    
    console.log('Running yt-dlp with args:', args.join(' '))

    const proc = spawn(ytdlpPath, args)
    let output = ''

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      output += text
      mainWindow.webContents.send('download-progress', -1, text.trim())
    })

    proc.stderr.on('data', (data) => {
      mainWindow.webContents.send('download-progress', -1, data.toString().trim())
    })

    proc.on('close', (code) => {
      console.log('yt-dlp output:', output)
      console.log('yt-dlp exit code:', code)
      
      // yt-dlp prints: title first, then filepath
      const lines = output.trim().split('\n').filter(l => l.trim() && !l.startsWith('WARNING'))
      let filePath = ''
      let title = ''
      
      // Find the filepath (contains drive letter or starts with /)
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.match(/^[A-Z]:\\/) || trimmed.startsWith('/')) {
          filePath = trimmed
        } else if (!filePath && trimmed.length > 0) {
          title = trimmed
        }
      }
      
      // If we found filepath but no title, use filename
      if (!title && filePath) {
        title = path.basename(filePath, path.extname(filePath))
      }
      
      console.log('Parsed filePath:', filePath)
      console.log('Parsed title:', title)
      
      // Look for thumbnail (could be .jpg or .webp)
      let thumbnail = null
      if (filePath) {
        const basePath = filePath.replace(/\.[^.]+$/, '')
        for (const ext of ['.jpg', '.webp', '.png']) {
          const thumbPath = basePath + ext
          if (fs.existsSync(thumbPath)) {
            thumbnail = thumbPath
            break
          }
        }
      }

      if (filePath && fs.existsSync(filePath)) {
        db.addItem({
          id: uuid(),
          title: title || path.basename(filePath),
          type: isAudioOnly ? 'audio' : 'video',
          url,
          filePath,
          thumbnail,
          createdAt: new Date().toISOString()
        })
        resolve({ success: true })
      } else {
        // Even if exit code is 0, file might not exist
        resolve({ success: false, error: 'File not found after download' })
      }
    })
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
})

ipcMain.handle('download-file', async (e, url, filename) => {
  const vaultPath = db.getSettings().vaultPath
  if (!vaultPath) return { success: false, error: 'No vault selected' }

  const filePath = path.join(vaultPath, filename)
  const file = fs.createWriteStream(filePath)
  const protocol = url.startsWith('https') ? https : http

  return new Promise((resolve) => {
    protocol.get(url, (response) => {
      const total = parseInt(response.headers['content-length'] || '0', 10)
      let downloaded = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        const progress = total ? Math.round((downloaded / total) * 100) : -1
        mainWindow.webContents.send('download-progress', progress, `Downloading: ${progress}%`)
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        db.addItem({
          id: uuid(),
          title: filename,
          type: 'file',
          url,
          filePath,
          thumbnail: null,
          createdAt: new Date().toISOString()
        })
        resolve({ success: true })
      })
    }).on('error', (err) => {
      fs.unlink(filePath, () => {})
      resolve({ success: false, error: err.message })
    })
  })
})
