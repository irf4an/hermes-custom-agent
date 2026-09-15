    // ================= WORKSPACE DRIVE (LOCAL VPS STORAGE) JS =================
    let currentDriveAgent = 'default';
    let driveDeliverablesData = [];
    let driveFilterQuery = '';

    // (agent display metadata now resolved via agentMetaFor() — no hardcoded team.)

    async function loadDriveView() {
      const btn = document.getElementById('btn-refresh-drive');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Refreshing...</span>';
        lucide.createIcons();
      }

      try {
        const data = await api('/api/drive/deliverables', {}, 'Gagal memuat drive');
        {
          driveDeliverablesData = data.deliverables || [];
          if (data.rootFolder) driveRootFolder = data.rootFolder;
        }
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
      const mediaCount = driveDeliverablesData.filter(d => ['video', 'audio', 'image'].includes(d.type)).length;

      const totalEl = document.getElementById('drive-total-files');
      const mediaEl = document.getElementById('drive-media-files');
      const ribbonPathEl = document.getElementById('drive-ribbon-path');

      if (totalEl) totalEl.textContent = `${totalCount} files`;
      if (mediaEl) mediaEl.textContent = `${mediaCount} media`;
      const meta = agentMetaFor(currentDriveAgent);
      if (ribbonPathEl) ribbonPathEl.textContent = agentFolder(currentDriveAgent);

      renderDriveAgentFolders();
      renderDriveFiles();
    }

    function renderDriveAgentFolders() {
      const grid = document.getElementById('drive-agent-folders-grid');
      if (!grid) return;

      // Folders follow live profiles + drive data, not a hardcoded team list.
      const agentKeys = [...new Set([...globalProfiles.map(x => x.id), ...driveDeliverablesData.map(d => d.agent)])];
      if (!agentKeys.includes(currentDriveAgent)) currentDriveAgent = agentKeys[0] || 'default';
      const curMeta = agentMetaFor(currentDriveAgent);
      const _t = document.getElementById('drive-current-agent-title');
      const _f = document.getElementById('drive-current-agent-folder-path');
      const _d = document.getElementById('drive-current-agent-desc');
      const _r = document.getElementById('drive-ribbon-path');
      if (_t) _t.textContent = `${curMeta.name} / Outputs`;
      if (_f) _f.textContent = agentFolder(currentDriveAgent);
      if (_d) _d.textContent = `Folder penyimpanan output ${curMeta.name} di storage lokal VPS.`;
      if (_r) _r.textContent = agentFolder(currentDriveAgent);
      
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

    function selectDriveAgent(agentKey) {
      currentDriveAgent = agentKey;
      const meta = agentMetaFor(agentKey);
      
      const titleEl = document.getElementById('drive-current-agent-title');
      const folderEl = document.getElementById('drive-current-agent-folder-path');
      const descEl = document.getElementById('drive-current-agent-desc');
      const ribbonPathEl = document.getElementById('drive-ribbon-path');

      if (titleEl) titleEl.textContent = `${meta.name} / Outputs`;
      if (folderEl) folderEl.textContent = agentFolder(agentKey);
      if (descEl) descEl.textContent = `Folder penyimpanan output ${meta.name} di storage lokal VPS.`;
      if (ribbonPathEl) ribbonPathEl.textContent = agentFolder(agentKey);

      renderDriveAgentFolders();
      renderDriveFiles();
    }

    function filterDriveFiles() {
      const input = document.getElementById('drive-file-search');
      driveFilterQuery = (input ? input.value : '').toLowerCase();
      renderDriveFiles();
    }

    function copyCurrentAgentPath() {
      navigator.clipboard.writeText(agentFolder(currentDriveAgent));
      const btnText = document.getElementById('btn-copy-path-text');
      if (btnText) {
        btnText.textContent = 'Path Copied!';
        setTimeout(() => { btnText.textContent = 'Copy VPS Path'; }, 1500);
      }
    }

    function renderDriveFiles() {
      const tbody = document.getElementById('drive-files-tbody');
      if (!tbody) return;

      let files = driveDeliverablesData.filter(d => d.agent === currentDriveAgent);
      if (driveFilterQuery) {
        files = files.filter(f => f.name.toLowerCase().includes(driveFilterQuery) || f.source.toLowerCase().includes(driveFilterQuery));
      }

      if (files.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-10 text-slate-400">
              <i data-lucide="hard-drive" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
              <p class="font-medium text-xs">Belum ada berkas output di direktori ini</p>
              <p class="text-[11px] text-slate-400 mt-0.5">Berkas .mp4, script, diagram, atau dokumen yang digenerate agent akan otomatis tersimpan di sini.</p>
            </td>
          </tr>
        `;
        lucide.createIcons();
        return;
      }

      let html = '';
      files.forEach(f => {
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

        html += `
          <tr class="hover:bg-slate-50/80 transition group">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5 min-w-0">
                <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor} flex-shrink-0"></i>
                <div class="min-w-0">
                  <span class="font-semibold text-slate-900 block truncate hover:underline cursor-pointer" onclick="previewDriveFile('${f.id}')">${f.name}</span>
                  <span class="text-[10px] font-mono text-slate-400 truncate block">${f.vpsFolder || ''}</span>
                </div>
              </div>
            </td>
            <td class="py-3 px-3 text-slate-600 truncate max-w-[180px]">${f.source}</td>
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
                <button onclick="previewDriveFile('${f.id}')" class="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer" title="Preview / Play">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteDriveFile('${f.id}')" class="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition cursor-pointer" title="Hapus Berkas">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                <a href="${f.downloadUrl}" download="${f.name}" class="p-1 rounded hover:bg-slate-200 text-blue-600 hover:text-blue-800 transition inline-flex items-center cursor-pointer" title="Download directly to laptop">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
      lucide.createIcons();
    }

    let currentPreviewDriveFileId = null;

    function previewDriveFile(fileId) {
      currentPreviewDriveFileId = fileId;
      const f = driveDeliverablesData.find(d => d.id === fileId);
      if (!f) return;

      const modal = document.getElementById('modal-drive-preview');
      const titleEl = document.getElementById('drive-preview-title');
      const metaEl = document.getElementById('drive-preview-meta');
      const bodyEl = document.getElementById('drive-preview-body');
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
            <div class="mt-2 text-[11px] text-slate-500 font-mono">Resolusi / Stream: ${f.name}</div>
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
              <h4 class="text-xs font-bold text-slate-800 mb-3">${f.name}</h4>
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
            <img src="${f.previewUrl}" class="max-h-[60vh] max-w-full rounded-lg shadow border border-slate-200 bg-white object-contain" alt="${f.name}">
          `;
        }
      } else {
        if (iconEl) iconEl.setAttribute('data-lucide', 'file-text');
        if (mediaWrapper) mediaWrapper.classList.add('hidden');
        if (bodyEl) {
          bodyEl.classList.remove('hidden');
          bodyEl.textContent = f.content || '(Berkas tersimpan di VPS. Klik "Download File" untuk mengunduh)';
        }
      }

      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeDrivePreviewModal() {
      currentPreviewDriveFileId = null;
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

