let downloading = false
let allItems = []
let currentFilter = 'all'
let dependencies = { ytdlp: false, ffmpeg: false }

async function init() {
  // Check dependencies first
  await checkDependencies()
  
  // Check if vault is already set
  const vaultPath = await window.vault.getVault()
  if (vaultPath) {
    showMainApp(vaultPath)
    await loadItems()
  }
  
  // Setup event listeners
  setupEventListeners()
  
  // Listen for download progress
  window.vault.onDownloadProgress((progress, message) => {
    const progressEl = document.getElementById('download-progress')
    const statusEl = document.getElementById('status-message')
    if (progressEl) progressEl.style.width = (progress > 0 ? progress : 0) + '%'
    if (statusEl) statusEl.textContent = message
    addLog(message, 'yellow')
  })
}

async function checkDependencies() {
  dependencies = await window.vault.checkDependencies()
  
  const ytdlpEl = document.getElementById('dep-ytdlp')
  const ffmpegEl = document.getElementById('dep-ffmpeg')
  const missingEl = document.getElementById('missing-deps')
  const missingText = document.getElementById('missing-deps-text')
  
  // Update yt-dlp status
  if (dependencies.ytdlp) {
    ytdlpEl.classList.add('success')
    ytdlpEl.classList.remove('error')
    ytdlpEl.querySelector('.dep-icon').textContent = '✓'
    ytdlpEl.querySelector('.dep-status').textContent = 'Installed'
  } else {
    ytdlpEl.classList.add('error')
    ytdlpEl.classList.remove('success')
    ytdlpEl.querySelector('.dep-icon').textContent = '✗'
    ytdlpEl.querySelector('.dep-status').textContent = 'Not found'
  }
  
  // Update ffmpeg status
  if (dependencies.ffmpeg) {
    ffmpegEl.classList.add('success')
    ffmpegEl.classList.remove('error')
    ffmpegEl.querySelector('.dep-icon').textContent = '✓'
    ffmpegEl.querySelector('.dep-status').textContent = 'Installed'
  } else {
    ffmpegEl.classList.add('error')
    ffmpegEl.classList.remove('success')
    ffmpegEl.querySelector('.dep-icon').textContent = '✗'
    ffmpegEl.querySelector('.dep-status').textContent = 'Not found'
  }
  
  // Show warning if missing
  const missing = []
  if (!dependencies.ytdlp) missing.push('yt-dlp')
  if (!dependencies.ffmpeg) missing.push('ffmpeg')
  
  if (missing.length > 0) {
    missingEl.classList.remove('hidden')
    missingText.textContent = `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required for downloading videos.`
    
    if (!dependencies.ytdlp) {
      const link = document.getElementById('link-ytdlp')
      link.classList.remove('hidden')
      link.addEventListener('click', (e) => {
        e.preventDefault()
        window.vault.openExternal('https://github.com/yt-dlp/yt-dlp#installation')
      })
    }
    
    if (!dependencies.ffmpeg) {
      const link = document.getElementById('link-ffmpeg')
      link.classList.remove('hidden')
      link.addEventListener('click', (e) => {
        e.preventDefault()
        window.vault.openExternal('https://ffmpeg.org/download.html')
      })
    }
  }
  
  // Update dashboard and settings
  updateDependencyStatus()
}

function updateDependencyStatus() {
  // Dashboard
  const ytdlpStatus = document.getElementById('ytdlp-status')
  const ffmpegStatus = document.getElementById('ffmpeg-status')
  if (ytdlpStatus) ytdlpStatus.textContent = dependencies.ytdlp ? 'OK' : 'Missing'
  if (ffmpegStatus) ffmpegStatus.textContent = dependencies.ffmpeg ? 'OK' : 'Missing'
  
  // Settings
  const settingsYtdlp = document.getElementById('settings-ytdlp')
  const settingsFfmpeg = document.getElementById('settings-ffmpeg')
  if (settingsYtdlp) {
    settingsYtdlp.textContent = dependencies.ytdlp ? 'Installed' : 'Not Found'
    settingsYtdlp.className = 'dep-badge ' + (dependencies.ytdlp ? 'success' : 'error')
  }
  if (settingsFfmpeg) {
    settingsFfmpeg.textContent = dependencies.ffmpeg ? 'Installed' : 'Not Found'
    settingsFfmpeg.className = 'dep-badge ' + (dependencies.ffmpeg ? 'success' : 'error')
  }
}

function setupEventListeners() {
  // Setup vault buttons
  document.getElementById('setup-vault-btn').addEventListener('click', selectVault)
  document.getElementById('change-vault-btn').addEventListener('click', selectVault)
  document.getElementById('settings-change-vault').addEventListener('click', selectVault)
  
  // Download buttons
  document.getElementById('youtube-btn').addEventListener('click', downloadYouTube)
  document.getElementById('file-btn').addEventListener('click', downloadFile)
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section
      navigateTo(section)
    })
  })
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter
      renderLibrary()
    })
  })
  
  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    renderLibrary(e.target.value)
  })
}

function navigateTo(section) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section)
  })
  
  // Update content
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.classList.remove('active')
  })
  document.getElementById(`${section}-section`).classList.add('active')
  
  // Update title
  const titles = {
    dashboard: 'Dashboard',
    downloads: 'Downloads',
    library: 'Library',
    settings: 'Settings'
  }
  document.getElementById('current-section').textContent = titles[section]
}

function showMainApp(vaultPath) {
  document.getElementById('setup-screen').classList.add('hidden')
  document.getElementById('main-app').classList.remove('hidden')
  document.getElementById('vault-path-display').textContent = vaultPath
  document.getElementById('settings-vault-path').textContent = vaultPath
  updateDependencyStatus()
}

async function selectVault() {
  const path = await window.vault.selectVault()
  if (path) {
    showMainApp(path)
    await loadItems()
    addLog(`Vault set to: ${path}`, 'green')
  }
}

async function loadItems() {
  allItems = await window.vault.getItems()
  updateStats()
  renderLibrary()
  renderRecentItems()
}


function updateStats() {
  const videos = allItems.filter(i => i.type === 'video').length
  const files = allItems.filter(i => i.type === 'file').length
  const total = allItems.length
  
  document.getElementById('video-count').textContent = videos
  document.getElementById('file-count').textContent = files
  document.getElementById('item-count').textContent = `${total} items`
  
  // Update progress bars (assuming max 100 items for visual)
  const maxItems = Math.max(total, 100)
  document.getElementById('video-progress').style.width = `${(videos / maxItems) * 100}%`
  document.getElementById('file-progress').style.width = `${(files / maxItems) * 100}%`
}

function renderLibrary(searchTerm = '') {
  const grid = document.getElementById('library-grid')
  let filtered = allItems
  
  // Apply type filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(i => i.type === currentFilter)
  }
  
  // Apply search
  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    filtered = filtered.filter(i => i.title.toLowerCase().includes(term))
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No items found</h3>
        <p>${allItems.length === 0 ? 'Download some content to get started' : 'Try a different search or filter'}</p>
      </div>
    `
    return
  }
  
  grid.innerHTML = filtered.map(item => createMediaCard(item)).join('')
  attachCardListeners()
}

function renderRecentItems() {
  const container = document.getElementById('recent-items')
  const recent = allItems.slice(0, 4)
  
  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No recent downloads</p>
      </div>
    `
    return
  }
  
  container.innerHTML = recent.map(item => createMediaCard(item)).join('')
  attachCardListeners()
}

function createMediaCard(item) {
  const icon = item.type === 'video' ? '🎬' : '📄'
  const thumbnail = item.thumbnail 
    ? `<img src="file://${escapeHtml(item.thumbnail)}" alt="">`
    : icon
  
  return `
    <div class="media-card" data-id="${item.id}">
      <div class="media-thumbnail">
        ${item.thumbnail ? `<img src="file://${escapeHtml(item.thumbnail)}" alt="">` : icon}
      </div>
      <div class="media-info">
        <p class="media-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</p>
        <p class="media-type">${item.type}</p>
        <div class="media-actions">
          <button class="open-btn" data-path="${escapeHtml(item.filePath)}">Open</button>
          <button class="delete-btn" data-id="${item.id}">Delete</button>
        </div>
      </div>
    </div>
  `
}

function attachCardListeners() {
  document.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      window.vault.openFile(btn.dataset.path)
    })
  })
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.vault.deleteItem(btn.dataset.id)
      addLog('Item deleted', 'yellow')
      await loadItems()
    })
  })
}

async function downloadYouTube() {
  const input = document.getElementById('youtube-url')
  const url = input.value.trim()
  
  if (!url) return
  
  if (!dependencies.ytdlp) {
    addLog('Error: yt-dlp is not installed', 'red')
    document.getElementById('status-message').textContent = 'Error: yt-dlp is not installed'
    return
  }
  
  setDownloading(true)
  addLog(`Starting YouTube download: ${url}`, 'yellow')
  document.getElementById('status-message').textContent = 'Starting YouTube download...'
  
  const result = await window.vault.downloadYouTube(url)
  
  setDownloading(false)
  if (result.success) {
    input.value = ''
    addLog('YouTube download complete!', 'green')
    document.getElementById('status-message').textContent = 'Download complete!'
    await loadItems()
  } else {
    addLog(`Error: ${result.error}`, 'red')
    document.getElementById('status-message').textContent = `Error: ${result.error}`
  }
}

async function downloadFile() {
  const urlInput = document.getElementById('file-url')
  const nameInput = document.getElementById('filename')
  const url = urlInput.value.trim()
  const filename = nameInput.value.trim()
  
  if (!url || !filename) return
  
  setDownloading(true)
  addLog(`Starting file download: ${filename}`, 'yellow')
  document.getElementById('status-message').textContent = 'Starting file download...'
  
  const result = await window.vault.downloadFile(url, filename)
  
  setDownloading(false)
  if (result.success) {
    urlInput.value = ''
    nameInput.value = ''
    addLog('File download complete!', 'green')
    document.getElementById('status-message').textContent = 'Download complete!'
    await loadItems()
  } else {
    addLog(`Error: ${result.error}`, 'red')
    document.getElementById('status-message').textContent = `Error: ${result.error}`
  }
}

function setDownloading(state) {
  downloading = state
  document.getElementById('youtube-btn').disabled = state
  document.getElementById('file-btn').disabled = state
  if (!state) {
    document.getElementById('download-progress').style.width = '0%'
  }
}

function addLog(message, type = '') {
  const log = document.getElementById('activity-log')
  const line = document.createElement('p')
  line.className = 'log-line ' + type
  line.textContent = `> ${message}`
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
  
  // Keep only last 50 lines
  while (log.children.length > 50) {
    log.removeChild(log.firstChild)
  }
}

function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Initialize
init()
