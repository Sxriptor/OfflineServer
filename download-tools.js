const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const BIN_DIR = path.join(__dirname, 'bin')

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR)
}

function followRedirects(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    
    const doRequest = (currentUrl) => {
      const protocol = currentUrl.startsWith('https') ? https : require('http')
      
      protocol.get(currentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          doRequest(response.headers.location)
          return
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }
        
        const total = parseInt(response.headers['content-length'] || '0', 10)
        let downloaded = 0
        
        response.on('data', (chunk) => {
          downloaded += chunk.length
          if (total) {
            const pct = Math.round((downloaded / total) * 100)
            const mb = (downloaded / 1024 / 1024).toFixed(1)
            process.stdout.write(`\r  ${mb}MB - ${pct}%   `)
          }
        })
        
        response.pipe(file)
        
        file.on('finish', () => {
          file.close()
          console.log(' Done!')
          resolve()
        })
      }).on('error', reject)
    }
    
    doRequest(url)
  })
}

async function main() {
  console.log('=== Downloading bundled tools ===\n')
  
  // yt-dlp
  const ytdlpDest = path.join(BIN_DIR, 'yt-dlp.exe')
  if (!fs.existsSync(ytdlpDest)) {
    console.log('Downloading yt-dlp.exe...')
    await followRedirects('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytdlpDest)
  } else {
    console.log('yt-dlp.exe already exists')
  }
  
  // ffmpeg - use the direct exe from gyan.dev (smaller, no extraction needed)
  const ffmpegDest = path.join(BIN_DIR, 'ffmpeg.exe')
  const ffprobeDest = path.join(BIN_DIR, 'ffprobe.exe')
  
  if (!fs.existsSync(ffmpegDest)) {
    console.log('\nDownloading ffmpeg (this is ~130MB, please wait)...')
    
    // Download the 7z archive and use PowerShell to extract
    const sevenZipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.7z'
    const archivePath = path.join(BIN_DIR, 'ffmpeg.7z')
    
    await followRedirects(sevenZipUrl, archivePath)
    
    console.log('Extracting with PowerShell...')
    
    // Try using 7zip if available, otherwise tell user to extract manually
    try {
      // Check if 7z is available
      execSync('where 7z', { stdio: 'ignore' })
      execSync(`7z e "${archivePath}" -o"${BIN_DIR}" ffmpeg.exe ffprobe.exe -r -y`, { stdio: 'inherit' })
    } catch {
      // No 7z, try PowerShell community module or manual
      console.log('\n7-Zip not found in PATH.')
      console.log('Please manually extract ffmpeg.exe and ffprobe.exe from:')
      console.log(`  ${archivePath}`)
      console.log(`To: ${BIN_DIR}`)
      console.log('\nOr install 7-Zip and add it to PATH, then run this script again.')
      console.log('\nAlternatively, copy your existing ffmpeg from:')
      console.log('  C:\\Users\\coler\\Desktop\\Backup\\development\\ffmpeg')
      return
    }
    
    // Cleanup
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath)
    }
  } else {
    console.log('ffmpeg.exe already exists')
  }
  
  console.log('\n=== Done! ===')
}

main().catch(console.error)
