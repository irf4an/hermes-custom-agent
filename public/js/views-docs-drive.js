    // ================= WORKSPACE DRIVE (ADVANCED FILE EXPLORER) JS =================
    let currentDriveAgent = 'default';
    let currentDriveSubPath = ''; // Relative path inside agent workspace (e.g. '', 'cron/output', 'clips')
    let driveDeliverablesData = [];
    let driveFilterQuery = '';
    let driveCategoryFilter = 'all'; // 'all', 'document', 'media', 'code'
    let driveViewMode = 'table'; // 'table' or 'grid'
    let driveBrowseMode = 'tree'; // 'tree' (hierarchical directory) or 'flat' (all files)
    let driveSortField = 'name'; // 'name', 'size', 'mtime'
    let driveSortOrder = 'asc'; // 'asc' or 'desc'
    let selectedDriveItems = new Set(); // Stores keys like 'folder:path' or 'file:id'

    async function loadDriveView() {
      const btn = document.getElementById('btn-refresh-drive');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Refreshing...</span>';
        lucide.createIcons();
      }

      try {
        const data = await api('/api/drive/deliverables', {}, 'Gagal memuat drive');
        driveDeliverablesData = data.deliverables || [];
        if (data.rootFolder) driveRootFolder = data.rootFolder;
      } catch (e) {
        console.error('Error fetching drive deliverables:', e);
      }

      renderDriveOverview();

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="rotate-cw" class="w-3.5 h-3.5" id="refresh-drive-icon"></i><span>Refresh Storage</span>';
        lucide.createIcons();
      }
    }

    function renderDriveOverview() {
      const totalCount = driveDeliverablesData.length;
      const mediaCount = driveDeliverablesData.filter(d => ['video', 'audio', 'image', 'diagram'].includes(d.type)).length;

      const totalEl = document.getElementById('drive-total-files');
      const mediaEl = document.getElementById('drive-media-files');

      if (totalEl) totalEl.textContent = `${totalCount} files`;
      if (mediaEl) mediaEl.textContent = `${mediaCount} media`;

      renderDriveAgentFolders();
      renderDriveFiles();
    }

    function renderDriveAgentFolders() {
      const grid = document.getElementById('drive-agent-folders-grid');
      if (!grid) return;

      const agentKeys = [...new Set([...globalProfiles.map(x => x.id), ...driveDeliverablesData.map(d => d.agent)])];
      if (!agentKeys.includes(currentDriveAgent)) currentDriveAgent = agentKeys[0] || 'default';
      
      updateAgentHeaderDetails();

      let html = '';
      agentKeys.forEach(k => {
        const meta = agentMetaFor(k);
        const agentFiles = driveDeliverablesData.filter(d => d.agent === k);
        const count = agentFiles.length;
        const isSelected = currentDriveAgent === k;

        const borderActive = isSelected ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60';

        html += `
          <div onclick="selectDriveAgent('${k}')" class="p-3.5 rounded-xl border ${borderActive} cursor-pointer transition shadow-2xs group flex flex-col justify-between">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform text-slate-700">
                  <i data-lucide="${meta.icon}" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <h4 class="text-xs font-bold text-slate-900 truncate">${meta.name}</h4>
                    ${isSelected ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>' : ''}
                  </div>
                  <span class="text-[10.5px] text-slate-500 block truncate">${meta.role}</span>
                </div>
              </div>
              <span class="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                VPS Local ✓
              </span>
            </div>

            <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span class="font-mono text-[10.5px] text-slate-400 truncate max-w-[170px]">${agentFolder(k)}</span>
              <span class="font-semibold text-slate-700">${count} items</span>
            </div>
          </div>
        `;
      });

      grid.innerHTML = html;
      lucide.createIcons();
    }

    function updateAgentHeaderDetails() {
      const curMeta = agentMetaFor(currentDriveAgent);
      const curFolder = getCurrentFolderPath();

      const _t = document.getElementById('drive-current-agent-title');
      const _f = document.getElementById('drive-current-agent-folder-path');
      const _d = document.getElementById('drive-current-agent-desc');
      const _r = document.getElementById('drive-ribbon-path');

      if (_t) _t.textContent = `${curMeta.name} / Outputs`;
      if (_f) _f.textContent = curFolder;
      if (_d) _d.textContent = `Penyimpanan berkas output ${curMeta.name} di storage VPS.`;
      if (_r) _r.textContent = curFolder;
    }

    function selectDriveAgent(agentKey) {
      currentDriveAgent = agentKey;
      currentDriveSubPath = ''; // Reset to root folder of agent
      selectedDriveItems.clear();
      updateDriveSelectionBar();
      renderDriveAgentFolders();
      renderDriveFiles();
    }

    function getCurrentFolderPath() {
      const base = agentFolder(currentDriveAgent);
      if (!currentDriveSubPath) return base;
      const cleanSub = currentDriveSubPath.replace(/^\/+|\/+$/g, '');
      return `${base.replace(/\/$/, '')}/${cleanSub}/`;
    }

    function copyCurrentAgentPath() {
      const pathText = getCurrentFolderPath();
      navigator.clipboard.writeText(pathText);
      const btnText = document.getElementById('btn-copy-path-text');
      if (btnText) {
        btnText.textContent = 'Path Copied!';
        setTimeout(() => { btnText.textContent = 'Copy Path'; }, 1500);
      }
    }

    function filterDriveFiles() {
      const input = document.getElementById('drive-file-search');
      driveFilterQuery = (input ? input.value : '').trim().toLowerCase();
      renderDriveFiles();
    }

    function setDriveCategory(cat) {
      driveCategoryFilter = cat;
      ['all', 'document', 'media', 'code'].forEach(c => {
        const btn = document.getElementById(`drive-cat-${c}`);
        if (!btn) return;
        if (c === cat) {
          btn.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-slate-900 shadow-2xs transition cursor-pointer';
        } else {
          btn.className = 'px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 hover:text-slate-900 transition cursor-pointer';
        }
      });
      renderDriveFiles();
    }

    function setDriveViewMode(mode) {
      driveViewMode = mode;
      const btnTable = document.getElementById('drive-btn-view-table');
      const btnGrid = document.getElementById('drive-btn-view-grid');
      const viewTable = document.getElementById('drive-view-table');
      const viewGrid = document.getElementById('drive-view-grid');

      if (mode === 'table') {
        if (btnTable) btnTable.className = 'px-2 py-1 rounded-md text-slate-900 bg-white shadow-2xs transition cursor-pointer';
        if (btnGrid) btnGrid.className = 'px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer';
        if (viewTable) viewTable.classList.remove('hidden');
        if (viewGrid) viewGrid.classList.add('hidden');
      } else {
        if (btnTable) btnTable.className = 'px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer';
        if (btnGrid) btnGrid.className = 'px-2 py-1 rounded-md text-slate-900 bg-white shadow-2xs transition cursor-pointer';
        if (viewTable) viewTable.classList.add('hidden');
        if (viewGrid) viewGrid.classList.remove('hidden');
      }

      renderDriveFiles();
    }

    function toggleDriveBrowseMode() {
      driveBrowseMode = (driveBrowseMode === 'tree') ? 'flat' : 'tree';
      const label = document.getElementById('drive-mode-label');
      const icon = document.getElementById('drive-mode-icon');
      if (label) label.textContent = driveBrowseMode === 'tree' ? 'Folders' : 'All Files';
      if (icon) icon.setAttribute('data-lucide', driveBrowseMode === 'tree' ? 'folder-tree' : 'align-justify');
      renderDriveFiles();
    }

    function toggleDriveSort(field) {
      if (driveSortField === field) {
        driveSortOrder = driveSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        driveSortField = field;
        driveSortOrder = (field === 'mtime') ? 'desc' : 'asc';
      }

      // Update sort icons in header
      ['name', 'size', 'mtime'].forEach(f => {
        const el = document.getElementById(`sort-icon-${f}`);
        if (!el) return;
        if (f === driveSortField) {
          const icon = driveSortOrder === 'asc' ? 'arrow-up' : 'arrow-down';
          el.innerHTML = `<i data-lucide="${icon}" class="w-3 h-3 text-blue-600 font-bold"></i>`;
        } else {
          el.innerHTML = `<i data-lucide="chevrons-up-down" class="w-3 h-3 text-slate-400"></i>`;
        }
      });

      renderDriveFiles();
    }

    function navigateToDriveFolder(subPath) {
      currentDriveSubPath = (subPath || '').replace(/^\/+|\/+$/g, '');
      selectedDriveItems.clear();
      updateDriveSelectionBar();
      updateAgentHeaderDetails();
      renderDriveFiles();
    }

    function navigateDriveUp() {
      if (!currentDriveSubPath) return;
      const parts = currentDriveSubPath.replace(/^\/+|\/+$/g, '').split('/');
      parts.pop();
      navigateToDriveFolder(parts.join('/'));
    }

    function renderDriveBreadcrumbs(folderCount, fileCount) {
      const container = document.getElementById('drive-breadcrumbs');
      const statsEl = document.getElementById('drive-current-folder-stats');
      if (!container) return;

      const curMeta = agentMetaFor(currentDriveAgent);
      const isTree = (driveBrowseMode === 'tree' && !driveFilterQuery);

      if (!isTree) {
        container.innerHTML = `
          <div class="flex items-center gap-1.5 text-slate-600 font-medium">
            <i data-lucide="search" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>${driveFilterQuery ? `Search: "${escapeHtml(driveFilterQuery)}"` : 'All Files Flat List'}</span>
            <span class="text-slate-400 font-mono text-[10px]">(${fileCount} files)</span>
          </div>
        `;
        if (statsEl) statsEl.textContent = `${fileCount} items total`;
        lucide.createIcons();
        return;
      }

      const cleanSub = currentDriveSubPath.replace(/^\/+|\/+$/g, '');
      const parts = cleanSub ? cleanSub.split('/') : [];

      let html = '';

      // Up button (only active if inside subfolder)
      if (parts.length > 0) {
        html += `
          <button type="button" onclick="navigateDriveUp()" class="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition mr-1 cursor-pointer" title="Go up one level (..)">
            <i data-lucide="corner-left-up" class="w-3.5 h-3.5"></i>
          </button>
        `;
      }

      // Root item
      const isRootActive = parts.length === 0;
      html += `
        <button type="button" onclick="navigateToDriveFolder('')" class="inline-flex items-center gap-1 font-semibold ${isRootActive ? 'text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded' : 'text-slate-700 hover:text-blue-600'} transition cursor-pointer">
          <i data-lucide="home" class="w-3.5 h-3.5"></i>
          <span>${curMeta.name}</span>
        </button>
      `;

      // Segment links
      let accumulated = '';
      parts.forEach((part, idx) => {
        accumulated += (accumulated ? '/' : '') + part;
        const targetPath = accumulated;
        const isLast = (idx === parts.length - 1);

        html += `
          <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>
          <button type="button" onclick="navigateToDriveFolder('${escapeHtml(targetPath)}')" class="${isLast ? 'font-bold text-slate-900 bg-white border border-slate-200 shadow-2xs px-2 py-0.5 rounded' : 'text-slate-600 hover:text-blue-600 font-medium'} transition cursor-pointer">
            ${escapeHtml(part)}
          </button>
        `;
      });

      container.innerHTML = html;
      if (statsEl) {
        statsEl.textContent = `${folderCount} folders · ${fileCount} files`;
      }
      lucide.createIcons();
    }

    function renderDriveFiles() {
      const tbody = document.getElementById('drive-files-tbody');
      const gridView = document.getElementById('drive-view-grid');
      if (!tbody && !gridView) return;

      // 1. Filter by active agent
      let agentFiles = driveDeliverablesData.filter(d => d.agent === currentDriveAgent);

      // 2. Category Filter
      if (driveCategoryFilter === 'document') {
        agentFiles = agentFiles.filter(d => ['document', 'pdf'].includes(d.type));
      } else if (driveCategoryFilter === 'media') {
        agentFiles = agentFiles.filter(d => ['video', 'audio', 'image', 'diagram'].includes(d.type));
      } else if (driveCategoryFilter === 'code') {
        agentFiles = agentFiles.filter(d => ['code', 'archive'].includes(d.type));
      }

      // 3. Search Filter (if active, search across all directories in flat mode)
      if (driveFilterQuery) {
        agentFiles = agentFiles.filter(f => 
          f.name.toLowerCase().includes(driveFilterQuery) || 
          f.source.toLowerCase().includes(driveFilterQuery) ||
          f.relPath.toLowerCase().includes(driveFilterQuery)
        );
      }

      const isTreeMode = (driveBrowseMode === 'tree' && !driveFilterQuery);
      const cleanSub = currentDriveSubPath.replace(/^\/+|\/+$/g, '');
      const prefix = cleanSub ? cleanSub + '/' : '';

      let currentFolders = [];
      let currentFiles = [];

      if (isTreeMode) {
        // Collect direct files and immediate subfolders under currentDriveSubPath
        const folderMap = new Map();

        agentFiles.forEach(f => {
          const rel = f.relPath.replace(/^\/+/, '');
          if (prefix && !rel.startsWith(prefix)) return;

          const remainder = prefix ? rel.slice(prefix.length) : rel;
          const slashIdx = remainder.indexOf('/');

          if (slashIdx === -1) {
            // Direct file
            currentFiles.push(f);
          } else {
            // Item inside a subfolder
            const folderName = remainder.slice(0, slashIdx);
            const folderPath = prefix + folderName;
            if (!folderMap.has(folderName)) {
              folderMap.set(folderName, {
                name: folderName,
                path: folderPath,
                count: 0,
                latestMtime: f.mtime,
                source: f.source || 'Folder'
              });
            }
            const folderObj = folderMap.get(folderName);
            folderObj.count += 1;
            if (new Date(f.mtime) > new Date(folderObj.latestMtime)) {
              folderObj.latestMtime = f.mtime;
            }
          }
        });

        currentFolders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      } else {
        currentFiles = [...agentFiles];
      }

      // 4. Sort Files
      currentFiles.sort((a, b) => {
        let valA, valB;
        if (driveSortField === 'size') {
          valA = a.size || 0;
          valB = b.size || 0;
        } else if (driveSortField === 'mtime') {
          valA = new Date(a.mtime || 0).getTime();
          valB = new Date(b.mtime || 0).getTime();
        } else {
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
        }

        if (valA < valB) return driveSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return driveSortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      // Update breadcrumbs & stats
      renderDriveBreadcrumbs(currentFolders.length, currentFiles.length);

      // 5. Render Table or Grid View
      if (driveViewMode === 'table') {
        renderTableView(tbody, currentFolders, currentFiles, isTreeMode);
      } else {
        renderGridView(gridView, currentFolders, currentFiles, isTreeMode);
      }

      lucide.createIcons();
    }

    function clearDriveSelection() {
      selectedDriveItems.clear();
      updateDriveSelectionBar();
      renderDriveFiles();
    }

    function toggleDriveItemSelect(key, isChecked) {
      if (isChecked) {
        selectedDriveItems.add(key);
      } else {
        selectedDriveItems.delete(key);
      }
      updateDriveSelectionBar();
      renderDriveFiles();
    }

    function toggleDriveSelectAll(isChecked) {
      if (isChecked) {
        const checkboxes = document.querySelectorAll('#drive-files-tbody input[type="checkbox"][data-item-key], #drive-view-grid input[type="checkbox"][data-item-key]');
        checkboxes.forEach(cb => {
          const k = cb.getAttribute('data-item-key');
          if (k) selectedDriveItems.add(k);
        });
      } else {
        selectedDriveItems.clear();
      }
      updateDriveSelectionBar();
      renderDriveFiles();
    }

    function updateDriveSelectionBar() {
      const bar = document.getElementById('drive-selection-bar');
      const countEl = document.getElementById('drive-selected-count');
      const selectAllBox = document.getElementById('drive-select-all-box');

      if (!bar) return;

      const size = selectedDriveItems.size;
      if (size > 0) {
        bar.classList.remove('hidden');
        if (countEl) countEl.textContent = `${size} item terpilih`;
      } else {
        bar.classList.add('hidden');
      }

      if (selectAllBox) {
        selectAllBox.checked = size > 0;
      }
    }

    async function deleteDriveFolder(folderPath, folderName) {
      const name = folderName || folderPath.split('/').pop() || folderPath;
      if (!confirm(`Hapus folder "${name}" beserta seluruh isinya secara permanen dari storage VPS?`)) return;

      try {
        const { ok, data } = await apiFull('/api/drive/folder', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentDriveAgent,
            folderPath: folderPath,
            cron: folderPath.startsWith('cron')
          })
        });

        if (!ok || !data.success) {
          alert('Gagal menghapus folder: ' + (data.error || 'Terjadi kesalahan'));
          return;
        }

        selectedDriveItems.delete(`folder:${folderPath}`);
        updateDriveSelectionBar();
        await loadDriveView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }

    async function deleteSelectedDriveItems() {
      const total = selectedDriveItems.size;
      if (total === 0) return;

      if (!confirm(`Hapus ${total} item terpilih secara permanen dari storage VPS? Tindakan ini tidak dapat dibatalkan.`)) return;

      const items = [];
      selectedDriveItems.forEach(key => {
        if (key.startsWith('folder:')) {
          const path = key.slice(7);
          items.push({
            type: 'folder',
            agent: currentDriveAgent,
            path: path,
            cron: path.startsWith('cron')
          });
        } else if (key.startsWith('file:')) {
          const id = key.slice(5);
          items.push({
            type: 'file',
            id: id
          });
        }
      });

      try {
        const { ok, data } = await apiFull('/api/drive/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });

        if (!ok || !data.success) {
          alert('Gagal menghapus beberapa item: ' + (data.error || 'Terjadi kesalahan'));
        }

        selectedDriveItems.clear();
        updateDriveSelectionBar();
        await loadDriveView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }

    function renderTableView(tbody, folders, files, isTreeMode) {
      if (!tbody) return;

      if (folders.length === 0 && files.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-12 text-slate-400">
              <i data-lucide="hard-drive" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
              <p class="font-medium text-xs text-slate-600">Direktori ini kosong</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Tidak ada berkas yang cocok dengan filter aktif di folder ini.</p>
            </td>
          </tr>
        `;
        return;
      }

      let html = '';

      // Up row in table
      if (isTreeMode && currentDriveSubPath) {
        html += `
          <tr class="hover:bg-blue-50/40 transition cursor-pointer group select-none" onclick="navigateDriveUp()">
            <td class="py-2.5 px-3 text-center text-slate-300">-</td>
            <td class="py-2.5 px-3 font-semibold text-blue-700 flex items-center gap-2">
              <i data-lucide="corner-left-up" class="w-4 h-4 text-blue-600"></i>
              <span>.. (Up one level)</span>
            </td>
            <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px]">Parent Directory</td>
            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-medium">Directory</span></td>
            <td class="py-2.5 px-3 text-slate-400">-</td>
            <td class="py-2.5 px-3 text-slate-400">-</td>
            <td class="py-2.5 px-3 text-slate-400">-</td>
            <td class="py-2.5 px-4 text-right text-blue-600 font-medium text-xs">Open ↵</td>
          </tr>
        `;
      }

      // Folder rows
      folders.forEach(f => {
        const itemKey = 'folder:' + f.path;
        const isSelected = selectedDriveItems.has(itemKey);
        const rowBg = isSelected ? 'bg-blue-50/80 border-l-2 border-l-blue-600' : 'hover:bg-amber-50/40';
        const dateStr = f.latestMtime ? new Date(f.latestMtime).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

        html += `
          <tr class="${rowBg} transition cursor-pointer group" onclick="navigateToDriveFolder('${escapeHtml(f.path)}')">
            <td class="py-3 px-3 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" data-item-key="${escapeHtml(itemKey)}" ${isSelected ? 'checked' : ''} onchange="toggleDriveItemSelect('${escapeHtml(itemKey)}', this.checked)" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" title="Pilih folder">
            </td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i data-lucide="folder" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <span class="font-bold text-slate-900 block truncate group-hover:text-amber-800">${escapeHtml(f.name)}</span>
                  <span class="text-[10.5px] text-slate-400 font-mono block">${f.count} item(s) inside</span>
                </div>
              </div>
            </td>
            <td class="py-3 px-3 text-slate-600 truncate max-w-[180px]">${escapeHtml(f.source)}</td>
            <td class="py-3 px-3">
              <span class="inline-block text-[10.5px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Folder</span>
            </td>
            <td class="py-3 px-3 font-mono text-slate-600 font-medium">${f.count} items</td>
            <td class="py-3 px-3 text-slate-500">${dateStr}</td>
            <td class="py-3 px-3">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-700">
                <i data-lucide="folder" class="w-3 h-3 text-slate-500"></i>
                <span>Local Subdir</span>
              </span>
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="navigateToDriveFolder('${escapeHtml(f.path)}')" class="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-amber-100 hover:text-amber-800 transition text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer">
                  <i data-lucide="folder-open" class="w-3 h-3 text-amber-600"></i>
                  <span>Open</span>
                </button>
                <button onclick="event.stopPropagation(); deleteDriveFolder('${escapeHtml(f.path)}', '${escapeHtml(f.name)}')" class="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition cursor-pointer" title="Hapus folder & isinya">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      // File rows
      files.forEach(f => {
        const itemKey = 'file:' + f.id;
        const isSelected = selectedDriveItems.has(itemKey);
        const rowBg = isSelected ? 'bg-blue-50/80 border-l-2 border-l-blue-600' : 'hover:bg-slate-50/80';

        let iconName = 'file-text';
        let iconColor = 'text-blue-600';
        let typeBadge = 'Doc';
        let typeBadgeClass = 'bg-slate-100 text-slate-700';

        if (f.type === 'video') {
          iconName = 'video';
          iconColor = 'text-purple-600';
          typeBadge = 'Video (.mp4)';
          typeBadgeClass = 'bg-purple-100 text-purple-800 font-semibold';
        } else if (f.type === 'image' || f.type === 'diagram') {
          iconName = 'image';
          iconColor = 'text-emerald-600';
          typeBadge = 'Image/Diagram';
          typeBadgeClass = 'bg-emerald-100 text-emerald-800';
        } else if (f.type === 'audio') {
          iconName = 'volume-2';
          iconColor = 'text-amber-600';
          typeBadge = 'Audio';
          typeBadgeClass = 'bg-amber-100 text-amber-800';
        } else if (f.type === 'code') {
          iconName = 'file-code';
          iconColor = 'text-indigo-600';
          typeBadge = 'Script/Code';
          typeBadgeClass = 'bg-indigo-100 text-indigo-800';
        }

        const dateStr = f.mtime ? new Date(f.mtime).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        const displaySub = f.relPath.includes('/') ? f.relPath : (f.vpsFolder || '');

        html += `
          <tr class="${rowBg} transition group">
            <td class="py-3 px-3 text-center" onclick="event.stopPropagation()">
              <input type="checkbox" data-item-key="${escapeHtml(itemKey)}" ${isSelected ? 'checked' : ''} onchange="toggleDriveItemSelect('${escapeHtml(itemKey)}', this.checked)" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" title="Pilih berkas">
            </td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor} flex-shrink-0"></i>
                <div class="min-w-0">
                  <span class="font-semibold text-slate-900 block truncate hover:underline cursor-pointer" onclick="previewDriveFile('${escapeHtml(f.id)}')">${escapeHtml(f.name)}</span>
                  <span class="text-[10px] font-mono text-slate-400 truncate block">${escapeHtml(displaySub)}</span>
                </div>
              </div>
            </td>
            <td class="py-3 px-3 text-slate-600 truncate max-w-[180px]">${escapeHtml(f.source)}</td>
            <td class="py-3 px-3">
              <span class="inline-block text-[10.5px] px-2 py-0.5 rounded-full ${typeBadgeClass}">${typeBadge}</span>
            </td>
            <td class="py-3 px-3 font-mono text-slate-600 font-medium">${f.sizeDisplay || '1 KB'}</td>
            <td class="py-3 px-3 text-slate-500">${dateStr}</td>
            <td class="py-3 px-3">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <i data-lucide="check" class="w-3 h-3 text-emerald-600"></i>
                <span>Stored on VPS</span>
              </span>
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="previewDriveFile('${escapeHtml(f.id)}')" class="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer" title="Preview / Play">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteDriveFile('${escapeHtml(f.id)}')" class="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition cursor-pointer" title="Hapus Berkas">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                <a href="${f.downloadUrl}" download="${escapeHtml(f.name)}" class="p-1 rounded hover:bg-slate-200 text-blue-600 hover:text-blue-800 transition inline-flex items-center cursor-pointer" title="Download directly to laptop">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    }

    function renderGridView(container, folders, files, isTreeMode) {
      if (!container) return;

      if (folders.length === 0 && files.length === 0) {
        container.innerHTML = `
          <div class="col-span-full text-center py-16 text-slate-400">
            <i data-lucide="hard-drive" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-xs text-slate-600">Direktori ini kosong</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Tidak ada berkas yang cocok dengan filter aktif di folder ini.</p>
          </div>
        `;
        return;
      }

      let html = '';

      // Up folder card
      if (isTreeMode && currentDriveSubPath) {
        html += `
          <div onclick="navigateDriveUp()" class="p-3 bg-white border border-dashed border-blue-300 rounded-xl hover:bg-blue-50/50 hover:border-blue-400 transition cursor-pointer flex items-center gap-2.5 shadow-2xs group">
            <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <i data-lucide="corner-left-up" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <span class="font-bold text-xs text-blue-700 block truncate">.. Up Level</span>
              <span class="text-[10px] text-slate-400 font-mono">Parent dir</span>
            </div>
          </div>
        `;
      }

      // Folder cards
      folders.forEach(f => {
        const itemKey = 'folder:' + f.path;
        const isSelected = selectedDriveItems.has(itemKey);
        const cardBorder = isSelected ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50' : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/30';

        html += `
          <div onclick="navigateToDriveFolder('${escapeHtml(f.path)}')" class="p-3 bg-white border ${cardBorder} rounded-xl transition cursor-pointer flex flex-col justify-between shadow-2xs group relative">
            <div class="flex items-center justify-between gap-1 mb-2">
              <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <i data-lucide="folder" class="w-4 h-4"></i>
              </div>
              <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                <input type="checkbox" data-item-key="${escapeHtml(itemKey)}" ${isSelected ? 'checked' : ''} onchange="toggleDriveItemSelect('${escapeHtml(itemKey)}', this.checked)" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" title="Pilih folder">
                <button onclick="deleteDriveFolder('${escapeHtml(f.path)}', '${escapeHtml(f.name)}')" class="p-1 rounded hover:bg-rose-100 text-rose-400 hover:text-rose-600 transition cursor-pointer" title="Hapus folder">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
            <div class="min-w-0">
              <span class="font-bold text-xs text-slate-900 block truncate group-hover:text-amber-800">${escapeHtml(f.name)}</span>
              <span class="text-[10px] text-slate-400 font-mono">${f.count} items</span>
            </div>
          </div>
        `;
      });

      // File cards
      files.forEach(f => {
        const itemKey = 'file:' + f.id;
        const isSelected = selectedDriveItems.has(itemKey);
        const cardBorder = isSelected ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300';

        let previewHtml = '';
        let extBadge = (f.name.split('.').pop() || 'file').toUpperCase();

        if (f.type === 'image' || f.type === 'diagram') {
          previewHtml = `
            <div class="w-full h-24 bg-slate-100 rounded-lg overflow-hidden mb-2 relative group-hover:opacity-90 transition">
              <img src="${f.previewUrl}" alt="${escapeHtml(f.name)}" class="w-full h-full object-cover">
            </div>
          `;
        } else if (f.type === 'video') {
          previewHtml = `
            <div class="w-full h-24 bg-slate-900 rounded-lg flex items-center justify-center mb-2 relative group-hover:bg-slate-800 transition">
              <i data-lucide="play-circle" class="w-8 h-8 text-white/80 group-hover:scale-110 transition-transform"></i>
              <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white">MP4</span>
            </div>
          `;
        } else if (f.type === 'audio') {
          previewHtml = `
            <div class="w-full h-24 bg-amber-50 border border-amber-100 rounded-lg flex flex-col items-center justify-center mb-2 text-amber-600">
              <i data-lucide="volume-2" class="w-7 h-7 mb-1"></i>
              <span class="text-[9px] font-mono font-bold text-amber-700">AUDIO</span>
            </div>
          `;
        } else {
          previewHtml = `
            <div class="w-full h-24 bg-slate-50 border border-slate-100 rounded-lg flex flex-col items-center justify-center mb-2 text-slate-500 group-hover:bg-blue-50/50 group-hover:border-blue-100 transition">
              <i data-lucide="${f.type === 'code' ? 'file-code' : 'file-text'}" class="w-7 h-7 mb-1 ${f.type === 'code' ? 'text-indigo-600' : 'text-blue-600'}"></i>
              <span class="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 shadow-2xs">${extBadge}</span>
            </div>
          `;
        }

        const dateStr = f.mtime ? new Date(f.mtime).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) : '-';

        html += `
          <div class="p-3 bg-white border ${cardBorder} rounded-xl hover:shadow-xs transition group flex flex-col justify-between shadow-2xs relative">
            <div class="absolute top-2 left-2 z-10" onclick="event.stopPropagation()">
              <input type="checkbox" data-item-key="${escapeHtml(itemKey)}" ${isSelected ? 'checked' : ''} onchange="toggleDriveItemSelect('${escapeHtml(itemKey)}', this.checked)" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-xs bg-white/90" title="Pilih berkas">
            </div>

            <div class="cursor-pointer pt-4" onclick="previewDriveFile('${escapeHtml(f.id)}')">
              ${previewHtml}
              <h5 class="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</h5>
              <div class="flex items-center justify-between text-[10.5px] text-slate-400 font-mono mt-1">
                <span>${f.sizeDisplay || '1 KB'}</span>
                <span>${dateStr}</span>
              </div>
            </div>

            <div class="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
              <span class="text-[10px] text-slate-500 truncate max-w-[80px]" title="${escapeHtml(f.source)}">${escapeHtml(f.source)}</span>
              <div class="flex items-center gap-1">
                <button onclick="previewDriveFile('${escapeHtml(f.id)}')" class="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer" title="Preview">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
                <a href="${f.downloadUrl}" download="${escapeHtml(f.name)}" class="p-1 rounded hover:bg-slate-100 text-blue-600 hover:text-blue-800 transition inline-flex items-center cursor-pointer" title="Download">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
                <button onclick="deleteDriveFile('${escapeHtml(f.id)}')" class="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition cursor-pointer" title="Delete">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
    }

    let currentPreviewDriveFileId = null;
    let isDriveEditorActive = false;

    function previewDriveFile(fileId) {
      currentPreviewDriveFileId = fileId;
      isDriveEditorActive = false;
      const f = driveDeliverablesData.find(d => d.id === fileId);
      if (!f) return;

      const modal = document.getElementById('modal-drive-preview');
      const titleEl = document.getElementById('drive-preview-title');
      const metaEl = document.getElementById('drive-preview-meta');
      const bodyEl = document.getElementById('drive-preview-body');
      const editorEl = document.getElementById('drive-preview-editor');
      const editToggle = document.getElementById('drive-preview-edit-toggle');
      const saveBtn = document.getElementById('drive-preview-save-btn');
      const mediaWrapper = document.getElementById('drive-preview-media-wrapper');
      const iconEl = document.getElementById('drive-preview-icon');
      const locationEl = document.getElementById('drive-preview-location');
      const downloadBtn = document.getElementById('drive-preview-download-btn');

      if (titleEl) titleEl.textContent = f.name;
      if (metaEl) metaEl.textContent = `${f.agentName} · ${f.sizeDisplay} · ${f.source}`;
      if (locationEl) locationEl.innerHTML = `<i data-lucide="hard-drive" class="w-3.5 h-3.5 text-emerald-600"></i> ${f.vpsFolder || driveRootFolder}`;
      if (downloadBtn) {
        downloadBtn.href = f.downloadUrl;
        downloadBtn.download = f.name;
      }

      // Reset editor visibility
      if (editorEl) {
        editorEl.classList.add('hidden');
        editorEl.value = f.content || '';
      }
      if (bodyEl) bodyEl.classList.remove('hidden');
      if (saveBtn) saveBtn.classList.add('hidden');

      const isTextEditable = ['document', 'code'].includes(f.type) || /\.(md|txt|json|py|sh|js|ts|html|css|yaml|yml|log|conf|sql)$/i.test(f.name);
      if (editToggle) {
        if (isTextEditable) {
          editToggle.classList.remove('hidden');
          const editTxt = document.getElementById('drive-preview-edit-text');
          const editIco = document.getElementById('drive-preview-edit-icon');
          if (editTxt) editTxt.textContent = 'Edit';
          if (editIco) editIco.setAttribute('data-lucide', 'edit-3');
        } else {
          editToggle.classList.add('hidden');
        }
      }

      // Handle video / audio / image vs text
      if (f.type === 'video') {
        if (iconEl) iconEl.setAttribute('data-lucide', 'video');
        if (bodyEl) bodyEl.classList.add('hidden');
        if (mediaWrapper) {
          mediaWrapper.classList.remove('hidden');
          mediaWrapper.innerHTML = `
            <video controls autoplay class="w-full rounded-xl shadow-md max-h-[60vh] bg-black">
              <source src="${f.previewUrl}" type="video/mp4">
              Browser tidak mendukung pemutar video.
            </video>
            <div class="mt-2 text-[11px] text-slate-500 font-mono">Resolusi / Stream: ${escapeHtml(f.name)}</div>
          `;
        }
      } else if (f.type === 'audio') {
        if (iconEl) iconEl.setAttribute('data-lucide', 'volume-2');
        if (bodyEl) bodyEl.classList.add('hidden');
        if (mediaWrapper) {
          mediaWrapper.classList.remove('hidden');
          mediaWrapper.innerHTML = `
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full max-w-md text-center">
              <i data-lucide="music" class="w-10 h-10 text-amber-500 mx-auto mb-3"></i>
              <h4 class="text-xs font-bold text-slate-800 mb-3">${escapeHtml(f.name)}</h4>
              <audio controls autoplay class="w-full">
                <source src="${f.previewUrl}">
              </audio>
            </div>
          `;
        }
      } else if (f.type === 'image' || f.type === 'diagram') {
        if (iconEl) iconEl.setAttribute('data-lucide', 'image');
        if (bodyEl) bodyEl.classList.add('hidden');
        if (mediaWrapper) {
          mediaWrapper.classList.remove('hidden');
          mediaWrapper.innerHTML = `
            <img src="${f.previewUrl}" class="max-h-[60vh] max-w-full rounded-lg shadow border border-slate-200 bg-white object-contain" alt="${escapeHtml(f.name)}">
          `;
        }
      } else {
        if (iconEl) iconEl.setAttribute('data-lucide', 'file-text');
        if (mediaWrapper) mediaWrapper.classList.add('hidden');
        if (bodyEl) {
          bodyEl.classList.remove('hidden');
          bodyEl.textContent = f.content || '(Berkas kosong atau teks tidak tersedia)';
        }
      }

      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function toggleDriveEditorMode() {
      isDriveEditorActive = !isDriveEditorActive;
      const bodyEl = document.getElementById('drive-preview-body');
      const editorEl = document.getElementById('drive-preview-editor');
      const saveBtn = document.getElementById('drive-preview-save-btn');
      const editTxt = document.getElementById('drive-preview-edit-text');
      const editIco = document.getElementById('drive-preview-edit-icon');

      if (isDriveEditorActive) {
        if (bodyEl) bodyEl.classList.add('hidden');
        if (editorEl) {
          editorEl.classList.remove('hidden');
          editorEl.focus();
        }
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (editTxt) editTxt.textContent = 'Preview';
        if (editIco) editIco.setAttribute('data-lucide', 'eye');
      } else {
        if (editorEl) editorEl.classList.add('hidden');
        if (bodyEl) {
          bodyEl.classList.remove('hidden');
          bodyEl.textContent = editorEl ? editorEl.value : '';
        }
        if (saveBtn) saveBtn.classList.add('hidden');
        if (editTxt) editTxt.textContent = 'Edit';
        if (editIco) editIco.setAttribute('data-lucide', 'edit-3');
      }
      lucide.createIcons();
    }

    async function saveDriveCurrentFile() {
      if (!currentPreviewDriveFileId) return;
      const editorEl = document.getElementById('drive-preview-editor');
      const saveBtn = document.getElementById('drive-preview-save-btn');
      const saveLabel = document.getElementById('drive-preview-save-label');

      if (!editorEl) return;
      const newContent = editorEl.value;

      if (saveBtn) saveBtn.disabled = true;
      if (saveLabel) saveLabel.textContent = 'Saving...';

      try {
        const { ok, data } = await apiFull('/api/drive/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentPreviewDriveFileId,
            content: newContent
          })
        });

        if (!ok || !data.success) {
          alert('Gagal menyimpan berkas: ' + (data.error || 'Terjadi kesalahan'));
          if (saveLabel) saveLabel.textContent = 'Save (Ctrl+S)';
          if (saveBtn) saveBtn.disabled = false;
          return;
        }

        // Update cached data
        const f = driveDeliverablesData.find(d => d.id === currentPreviewDriveFileId);
        if (f) {
          f.content = newContent;
          if (data.size) f.sizeDisplay = `${(data.size / 1024).toFixed(1)} KB`;
        }

        if (saveLabel) saveLabel.textContent = 'Saved ✓';
        setTimeout(() => {
          if (saveLabel) saveLabel.textContent = 'Save (Ctrl+S)';
          if (saveBtn) saveBtn.disabled = false;
        }, 1500);

        // Background reload to refresh lists
        loadDriveView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
        if (saveLabel) saveLabel.textContent = 'Save (Ctrl+S)';
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    function handleDriveEditorKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDriveCurrentFile();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }
    }

    function closeDrivePreviewModal() {
      currentPreviewDriveFileId = null;
      isDriveEditorActive = false;
      const modal = document.getElementById('modal-drive-preview');
      const mediaWrapper = document.getElementById('drive-preview-media-wrapper');
      if (mediaWrapper) mediaWrapper.innerHTML = ''; // stop video playback
      if (modal) modal.classList.add('hidden');
    }

    async function deleteDriveFile(fileId) {
      const f = driveDeliverablesData.find(d => d.id === fileId);
      const name = f ? f.name : fileId;
      if (!confirm(`Hapus berkas "${name}" secara permanen dari storage VPS?`)) return;

      try {
        const { ok: driveDelOk, data } = await apiFull('/api/drive/file', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fileId })
        });
        if (!driveDelOk || !data.success) {
          alert('Gagal menghapus berkas: ' + (data.error || 'Terjadi kesalahan'));
          return;
        }

        await loadDriveView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }

    async function deleteCurrentDrivePreviewFile() {
      if (!currentPreviewDriveFileId) return;
      const fileId = currentPreviewDriveFileId;
      closeDrivePreviewModal();
      await deleteDriveFile(fileId);
    }

    // ================= FASE 2: UPLOAD, MKDIR, NEW FILE, DRAG & DROP =================

    async function handleDriveFilePicker(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      await uploadDriveFileList(files);
      event.target.value = ''; // Reset input
    }

    let dragCounter = 0;

    function handleDriveDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('drive-drag-overlay');
      const targetLabel = document.getElementById('drive-drag-dest-path');
      if (overlay) overlay.classList.remove('hidden');
      if (targetLabel) targetLabel.textContent = `Target: ${getCurrentFolderPath()}`;
    }

    function handleDriveDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('drive-drag-overlay');
      if (overlay) overlay.classList.add('hidden');
    }

    async function handleDriveDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('drive-drag-overlay');
      if (overlay) overlay.classList.add('hidden');

      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        await uploadDriveFileList(dt.files);
      }
    }

    async function uploadDriveFileList(fileList) {
      const total = fileList.length;
      let successCount = 0;

      for (let i = 0; i < total; i++) {
        const file = fileList[i];
        try {
          const isText = file.type.startsWith('text/') || /\.(md|txt|json|py|sh|js|ts|html|css|yaml|yml|log|conf|sql)$/i.test(file.name);
          
          if (isText) {
            const textContent = await file.text();
            const { ok, data } = await apiFull('/api/drive/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent: currentDriveAgent,
                subPath: currentDriveSubPath,
                fileName: file.name,
                fileData: textContent,
                isBase64: false
              })
            });
            if (ok && data.success) successCount++;
          } else {
            // Read binary as Base64
            const base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result;
                const base64 = res.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            const { ok, data } = await apiFull('/api/drive/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent: currentDriveAgent,
                subPath: currentDriveSubPath,
                fileName: file.name,
                fileData: base64Data,
                isBase64: true
              })
            });
            if (ok && data.success) successCount++;
          }
        } catch (err) {
          console.error('Error uploading', file.name, err);
        }
      }

      await loadDriveView();
      alert(`Berhasil mengunggah ${successCount} dari ${total} berkas ke direktori ${getCurrentFolderPath()}`);
    }

    async function promptCreateDriveFolder() {
      const folderName = prompt('Masukkan nama folder baru (misal: reports atau clips):');
      if (!folderName || !folderName.trim()) return;

      try {
        const { ok, data } = await apiFull('/api/drive/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentDriveAgent,
            subPath: currentDriveSubPath,
            folderName: folderName.trim()
          })
        });

        if (!ok || !data.success) {
          alert('Gagal membuat folder: ' + (data.error || 'Terjadi kesalahan'));
          return;
        }

        await loadDriveView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }

    async function promptCreateDriveFile() {
      const fileName = prompt('Masukkan nama berkas baru (contoh: notes.md atau test.py):');
      if (!fileName || !fileName.trim()) return;

      const cleanName = fileName.trim();
      const isMd = cleanName.endsWith('.md');
      const initialContent = isMd ? `# ${cleanName.replace(/\.md$/, '')}\n\nDibuat pada ${new Date().toLocaleString('id-ID')}\n\n` : '';

      try {
        const { ok, data } = await apiFull('/api/drive/new-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentDriveAgent,
            subPath: currentDriveSubPath,
            fileName: cleanName,
            content: initialContent
          })
        });

        if (!ok || !data.success) {
          alert('Gagal membuat berkas: ' + (data.error || 'Terjadi kesalahan'));
          return;
        }

        await loadDriveView();

        // Auto open in preview modal with editor active
        const createdRelPath = (currentDriveSubPath ? currentDriveSubPath + '/' : '') + cleanName;
        const targetId = `ws:${currentDriveAgent}:${createdRelPath}`;
        previewDriveFile(targetId);
        toggleDriveEditorMode();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }
