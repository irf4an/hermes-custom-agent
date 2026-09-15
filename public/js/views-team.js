    function renderAgents() {
      const container = document.getElementById('agents-list');
      if (!container) return;
      document.getElementById('agents-count').textContent = `Agents (${agentsData.length})`;
      
      const left = [];
      const right = [];
      agentsData.forEach((a, idx) => {
        if (idx % 2 === 0) left.push(a);
        else right.push(a);
      });

      const profileSessions = (globalSessionsData && globalSessionsData.sessionsByProfile) || {};

      const cols = [left, right];
      container.innerHTML = cols.map(col => `
        <div class="agents-column">
          ${col.map(a => {
            const stats = profileSessions[a.name] || { total: 0, active: 0 };
            const sessionLabel = stats.active > 0 
              ? `${stats.total} sessions (${stats.active} active)` 
              : `${stats.total} sessions`;
            return `
            <div class="agent-row">
              <div class="agent-left">
                <div class="status-indicator ${a.online ? 'online' : 'offline'}"></div>
                <span class="agent-title">${a.label}</span>
                ${a.tag ? `<span class="agent-badge default">${a.tag}</span>` : (!a.online ? `<span class="agent-badge offline-badge">offline</span>` : '')}
              </div>
              <span class="agent-sessions font-mono text-[11px] text-slate-500">${sessionLabel}</span>
            </div>
          `;
          }).join('')}
        </div>
      `).join('');

      const onlineCount = agentsData.filter(a => a.online).length;
      const activeSessCount = (globalSessionsData && globalSessionsData.stats && globalSessionsData.stats.activeSessions) || 0;
      document.getElementById('active-sessions-badge').textContent = `${onlineCount} online · ${activeSessCount} active sessions`;
    }

    let globalProfiles = [];

    function getAvatarColor(id) {
      const colors = {
        default: 'background: #831843;', // Maroon
        atlas: 'background: #1e3a8a;',   // Blue
        muse: 'background: #581c87;',    // Purple
        pixel: 'background: #0e7490;',   // Cyan
        vera: 'background: #78350f;',    // Amber
      };
      return colors[id] || 'background: #334155;';
    }

    function getInitials(name) {
      if (!name) return 'AG';
      const clean = name.replace(/[^a-zA-Z]/g, '');
      return clean.substring(0, 2).toUpperCase();
    }

    function renderTeamView() {
      const profiles = globalProfiles; // live data; empty until /api/profiles resolves

      // Update team summary metrics
      const totalEl = document.getElementById('team-metric-total');
      const onlineEl = document.getElementById('team-metric-online');
      const onlineSub = document.getElementById('team-metric-online-sub');
      const barEl = document.getElementById('team-metric-bar');
      const sessEl = document.getElementById('team-metric-sessions');
      const sessSub = document.getElementById('team-metric-sessions-sub');

      const runningProfiles = profiles.filter(p => p.gatewayStatus === 'running');
      const onlineCount = runningProfiles.length;
      if (totalEl) totalEl.textContent = profiles.length;
      if (onlineEl) onlineEl.textContent = onlineCount;
      if (onlineSub) onlineSub.textContent = `${onlineCount} running · ${profiles.length - onlineCount} stopped`;
      if (barEl) barEl.style.width = `${Math.round((onlineCount / (profiles.length || 1)) * 100)}%`;

      if (globalSessionsData && globalSessionsData.stats) {
        if (sessEl) sessEl.textContent = globalSessionsData.stats.activeSessions || 0;
        if (sessSub) sessSub.textContent = `${globalSessionsData.stats.totalSessions || 0} total recorded`;
      }

      document.getElementById('team-section-header').textContent = `[${profiles.length}]`;

      // Sequential selector
      const seqSelect = document.getElementById('team-seq-select');
      if (seqSelect) {
        seqSelect.innerHTML = profiles.map(p => `
          <option value="${p.id}">${p.name} (${p.id})</option>
        `).join('');
      }

      // Parallel status chips
      const parallelCount = document.getElementById('team-parallel-count');
      if (parallelCount) parallelCount.textContent = `${runningProfiles.length} running`;

      const chipsContainer = document.getElementById('team-parallel-chips');
      if (chipsContainer) {
        chipsContainer.innerHTML = profiles.map(p => {
          const isOnline = p.gatewayStatus === 'running';
          const dotColor = isOnline ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300';
          return `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 shadow-2xs">
              <span class="w-2 h-2 rounded-full ${dotColor}"></span>
              <span>${p.name}</span>
            </span>
          `;
        }).join('');
      }

      // Team Cards Grid
      const gridContainer = document.getElementById('team-cards-grid');
      if (gridContainer) {
        gridContainer.innerHTML = profiles.map(p => {
          const isOnline = p.gatewayStatus === 'running';
          const skills = p.skillsCount || 17;
          const model = p.model || 'ag/gemini-3.7-flash-high';
          const path = p.path || `~/.hermes/profiles/${p.id}`;
          const profileStats = (globalSessionsData && globalSessionsData.sessionsByProfile && globalSessionsData.sessionsByProfile[p.id]) || { total: 0, active: 0 };

          return `
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition">
              <div>
                <!-- Header -->
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                      ${p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm font-bold text-slate-900">${escapeHtml(p.name)}</span>
                        <span class="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">${escapeHtml(p.id)}</span>
                        ${p.isDefault ? '<span class="text-[10px] font-semibold uppercase bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">default</span>' : ''}
                      </div>
                      <div class="text-[11px] text-slate-500 mt-0.5 truncate">${escapeHtml(p.description || '')}</div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    ${isOnline ? `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Active
                      </span>
                    ` : `
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        Stopped
                      </span>
                    `}
                  </div>
                </div>

                <!-- Assigned Model Box -->
                <div class="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-[10px] uppercase font-bold text-slate-400">Model Primary</span>
                    <span class="font-mono font-semibold text-slate-800 text-[11px] truncate max-w-[200px]" title="${escapeHtml(model)}">${escapeHtml(model)}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50">
                    <span class="text-[10px] uppercase font-bold text-slate-400">Sessions</span>
                    <span class="font-mono text-[11px] text-slate-600">${profileStats.total} total · <span class="${profileStats.active > 0 ? 'text-emerald-600 font-bold' : 'text-slate-500'}">${profileStats.active} active</span></span>
                  </div>
                </div>

                <!-- Tags / Metadata -->
                <div class="flex flex-wrap items-center gap-1.5 mt-3 text-[11px]">
                  <span class="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-mono text-[10px]">
                    <i data-lucide="wrench" class="w-3 h-3 text-slate-400"></i> ${skills} skills
                  </span>
                  <span class="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-mono text-[10px]">
                    <i data-lucide="folder" class="w-3 h-3 text-slate-400"></i> ${escapeHtml(shortHermes(path))}
                  </span>
                </div>
              </div>

              <!-- Footer Actions -->
              <div class="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-3 text-xs">
                <span class="text-slate-400 font-mono text-[10px]">${p.createdAtFormatted || 'hermes profile'}</span>
                <div class="flex items-center gap-2">
                  <button onclick="openEditAgent('${p.id}')" class="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer">
                    Edit agent →
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      lucide.createIcons();
    }

    let currentEditAgentId = null;

    function toggleAgentMenu(id, event) {
      if (event) event.stopPropagation();
      const menu = document.getElementById(`agent-menu-${id}`);
      const isClosed = menu ? menu.classList.contains('hidden') : true;
      document.querySelectorAll('.agent-dropdown-menu').forEach(m => m.classList.add('hidden'));
      if (isClosed && menu) {
        menu.classList.remove('hidden');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.agent-dropdown-menu') && !e.target.closest('button[onclick*="toggleAgentMenu"]')) {
        document.querySelectorAll('.agent-dropdown-menu').forEach(m => m.classList.add('hidden'));
      }
    });

    async function openEditAgent(id) {
      document.querySelectorAll('.agent-dropdown-menu').forEach(m => m.classList.add('hidden'));
      currentEditAgentId = id;

      const teamView = document.getElementById('view-team');
      const editAgentView = document.getElementById('view-edit-agent');
      const pageTitle = document.getElementById('page-title');

      if (teamView) teamView.classList.add('hidden');
      if (editAgentView) editAgentView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Edit agent';

      let p = globalProfiles.find(x => x.id === id) || {
        id: id,
        name: capAgentId(id),
        description: `${capAgentId(id)} AI Agent`,
        model: '',
        path: id === 'default' ? '~/.hermes' : `~/.hermes/profiles/${id}`,
        skillsCount: 0,
        active: true
      };

      try {
        const d = await api(`/api/profiles/${id}`, {}, 'Failed to load profile');
        if (d.profile) p = d.profile;
      } catch (err) {}

      const initials = getInitials(p.name || p.id);
      const avatarStyle = getAvatarColor(p.id);

      const avatarEl = document.getElementById('edit-agent-avatar');
      if (avatarEl) {
        avatarEl.textContent = initials;
        avatarEl.setAttribute('style', avatarStyle);
      }

      document.getElementById('edit-agent-title').textContent = p.name;
      document.getElementById('edit-agent-subtitle').textContent = p.description || `${p.name} AI Agent`;

      const activeCheckbox = document.getElementById('edit-agent-active-checkbox');
      if (activeCheckbox) activeCheckbox.checked = p.active !== false;

      document.getElementById('edit-agent-name-input').value = p.id;
      document.getElementById('edit-agent-desc-input').value = p.description || '';
      document.getElementById('edit-agent-persona-input').value = p.persona || '';
      document.getElementById('edit-agent-persona-path').textContent = `${p.id}/SOUL.md`;

      const modelSelect = document.getElementById('edit-agent-model-select');
      const providerSelect = document.getElementById('edit-agent-provider-select');
      
      if (providerSelect) {
        if (p.model && (p.model.startsWith('opencode') || p.model.startsWith('opencode-free/'))) {
          providerSelect.value = 'opencode-free';
        } else if (p.model && (p.model.includes('codex') || p.model === 'gpt-5.6-luna')) {
          providerSelect.value = 'openai-codex';
        } else if (p.model && p.model.includes('openrouter')) {
          providerSelect.value = 'openrouter';
        } else if (p.model && p.model.includes('nvidia')) {
          providerSelect.value = 'nvidia';
        } else {
          providerSelect.value = '9router';
        }
        onProviderChange(p.model);
      }

      document.getElementById('edit-agent-fallback-input').value = p.fallbackModel || 'ag/gemini-3.7-flash-high';
      document.getElementById('edit-agent-temp-input').value = p.temperature !== undefined ? p.temperature : 0.7;

      // Load Services and Keys for this agent
      await loadAgentServices(id);

      // Load Abilities (Skills & Toolsets) for this agent
      await loadAgentAbilities(id);

      const deleteBtn = document.getElementById('edit-agent-danger-delete-btn');
      if (deleteBtn) {
        if (p.isDefault) {
          deleteBtn.disabled = true;
          deleteBtn.className = 'inline-flex items-center gap-1.5 bg-slate-300 text-slate-500 text-xs font-semibold px-4 py-2 rounded-lg cursor-not-allowed';
          deleteBtn.title = 'Cannot delete default agent profile';
        } else {
          deleteBtn.disabled = false;
          deleteBtn.className = 'inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition cursor-pointer';
          deleteBtn.title = 'Delete this agent profile';
        }
      }

      switchEditAgentTab('identity');
      lucide.createIcons();
    }

    let currentProfileServices = [];
    let currentActiveServiceModal = null;

    function toggleHelperModelsAccordion() {
      const content = document.getElementById('helper-models-content');
      const chevron = document.getElementById('helper-models-chevron');
      if (!content || !chevron) return;
      const isHidden = content.classList.contains('hidden');
      if (isHidden) {
        content.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
      } else {
        content.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
      }
    }

    function renderServicesList(services) {
      const container = document.getElementById('services-list-container');
      if (!container) return;

      if (!services || services.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No services found</div>';
        return;
      }

      container.innerHTML = services.map(s => {
        const isConfigured = s.configured;
        return `
          <div onclick="openServiceKeyModal('${s.id}')" class="px-4 py-3.5 bg-white hover:bg-slate-50/80 flex items-center justify-between cursor-pointer transition">
            <div class="min-w-0 flex-1 pr-3">
              <div class="text-xs font-semibold text-slate-900 leading-tight">${s.name}</div>
              <div class="text-[11px] text-slate-400 mt-0.5 truncate">${s.subtitle || ''}</div>
            </div>
            <div class="flex-shrink-0">
              ${isConfigured
                ? '<span class="text-xs font-semibold text-emerald-600 flex items-center gap-1"><span>✓</span> <span>Configured</span></span>'
                : '<span class="text-xs font-medium text-slate-400">Not set</span>'}
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadAgentServices(agentId) {
      try {
        const d = await api(`/api/profiles/${agentId}/services`, {}, 'Failed to load services');
        {
          currentProfileServices = d.services || [];
          const countEl = document.getElementById('services-configured-count');
          if (countEl) countEl.textContent = `${d.configuredCount || 0} configured`;
          renderServicesList(currentProfileServices);
        }
      } catch (err) {
        console.error('Error loading services:', err);
      }
    }

    function filterServicesList() {
      const q = (document.getElementById('services-search')?.value || '').toLowerCase();
      const filtered = currentProfileServices.filter(s => {
        return !q || s.name.toLowerCase().includes(q) || (s.subtitle && s.subtitle.toLowerCase().includes(q));
      });
      renderServicesList(filtered);
    }

    function openServiceKeyModal(serviceId) {
      const s = currentProfileServices.find(x => x.id === serviceId);
      if (!s) return;
      currentActiveServiceModal = s;

      document.getElementById('service-modal-title').textContent = `Configure: ${s.name}`;
      document.getElementById('service-modal-label').textContent = `${s.keyName} Value`;
      document.getElementById('service-modal-input').value = s.keyMasked || '';
      document.getElementById('service-modal-help').textContent = `Stored in profile .env for ${currentEditAgentId}`;
      
      document.getElementById('service-key-modal').classList.remove('hidden');
    }

    function closeServiceKeyModal() {
      document.getElementById('service-key-modal').classList.add('hidden');
      currentActiveServiceModal = null;
    }

    async function submitServiceKeySave() {
      if (!currentActiveServiceModal || !currentEditAgentId) return;
      const val = document.getElementById('service-modal-input')?.value?.trim();
      if (!val) {
        alert('Please enter a value');
        return;
      }
      try {
        const { ok: keySaveOk } = await apiFull(`/api/profiles/${currentEditAgentId}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyName: currentActiveServiceModal.keyName,
            keyValue: val
          })
        });
        if (keySaveOk) {
          alert(`Saved ${currentActiveServiceModal.name} key successfully!`);
          closeServiceKeyModal();
          await loadAgentServices(currentEditAgentId);
        } else {
          alert('Failed to save service key');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    // ================= AGENT ABILITIES (SKILLS & TOOLSETS) CONTROLLER =================

    let currentAgentAbilities = {
      profile: null,
      toolsets: [],
      skills: [],
      activeCategory: 'all',
      searchQuery: ''
    };

    async function loadAgentAbilities(agentId) {
      if (!agentId) return;
      try {
        const data = await api(`/api/profiles/${agentId}/abilities`, {}, 'Failed to load abilities');
        {
          currentAgentAbilities.profile = agentId;
          currentAgentAbilities.toolsets = data.toolsets || [];
          currentAgentAbilities.skills = data.skills || [];
          renderAbilitiesView();
        }
      } catch (err) {
        console.error('Error loading abilities:', err);
      }
    }

    function renderAbilitiesView() {
      const toolsets = currentAgentAbilities.toolsets || [];
      const skills = currentAgentAbilities.skills || [];

      const enabledToolsets = toolsets.filter(t => t.enabled).length;
      const enabledSkills = skills.filter(s => s.enabled).length;
      const disabledSkills = skills.length - enabledSkills;

      // Update Header counts
      const tsStatus = document.getElementById('abilities-toolsets-status');
      const skStatus = document.getElementById('abilities-skills-status');
      const tsBadge = document.getElementById('abilities-toolsets-badge');
      const skBadge = document.getElementById('abilities-skills-badge');

      if (tsStatus) tsStatus.textContent = `${enabledToolsets} / ${toolsets.length} Toolsets`;
      if (skStatus) skStatus.textContent = `${enabledSkills} / ${skills.length} Skills`;
      if (tsBadge) tsBadge.textContent = `[${enabledToolsets}/${toolsets.length}]`;
      if (skBadge) skBadge.textContent = `[${enabledSkills}/${skills.length}]`;

      // Update Category Pill Counts
      const countAll = document.getElementById('ab-skill-count-all');
      const countActive = document.getElementById('ab-skill-count-active');
      const countDisabled = document.getElementById('ab-skill-count-disabled');
      if (countAll) countAll.textContent = skills.length;
      if (countActive) countActive.textContent = enabledSkills;
      if (countDisabled) countDisabled.textContent = disabledSkills;

      // Render Toolsets Grid
      const tsGrid = document.getElementById('edit-agent-toolsets-grid');
      if (tsGrid) {
        tsGrid.innerHTML = toolsets.map(ts => `
          <div class="bg-white border ${ts.enabled ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-200/80 bg-slate-50/50 opacity-75'} rounded-xl p-3.5 shadow-2xs flex items-start justify-between gap-3 transition hover:border-slate-300">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <i data-lucide="${ts.icon || 'blocks'}" class="w-4 h-4 ${ts.enabled ? 'text-indigo-600' : 'text-slate-400'} shrink-0"></i>
                <span class="text-xs font-bold text-slate-900">${escapeHtml(ts.name)}</span>
                <span class="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">${escapeHtml(ts.category)}</span>
              </div>
              <p class="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-1.5">${escapeHtml(ts.description)}</p>
              <div class="text-[10px] font-mono text-slate-400">
                tools: ${ts.tools.join(', ')}
              </div>
            </div>
            <label class="agent-toggle shrink-0" title="${ts.enabled ? 'Nonaktifkan toolset' : 'Aktifkan toolset'}">
              <input type="checkbox" ${ts.enabled ? 'checked' : ''} onchange="toggleToolset('${ts.id}', this.checked)">
              <span class="agent-slider"></span>
            </label>
          </div>
        `).join('');
      }

      // Render Skills Grid
      renderAbilitiesSkillsGrid();
      lucide.createIcons();
    }

    function renderAbilitiesSkillsGrid() {
      const skillsGrid = document.getElementById('edit-agent-skills-grid');
      const emptyEl = document.getElementById('edit-agent-skills-empty');
      if (!skillsGrid) return;

      const cat = currentAgentAbilities.activeCategory || 'all';
      const q = (currentAgentAbilities.searchQuery || '').toLowerCase().trim();

      const filtered = (currentAgentAbilities.skills || []).filter(sk => {
        // Category filter
        if (cat === 'active' && !sk.enabled) return false;
        if (cat === 'disabled' && sk.enabled) return false;
        if (cat !== 'all' && cat !== 'active' && cat !== 'disabled') {
          if (sk.category !== cat) return false;
        }

        // Search query
        if (q) {
          const matchName = sk.name.toLowerCase().includes(q);
          const matchDesc = (sk.description || '').toLowerCase().includes(q);
          const matchCat = (sk.category || '').toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchCat) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        skillsGrid.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }

      if (emptyEl) emptyEl.classList.add('hidden');

      skillsGrid.innerHTML = filtered.map(sk => `
        <div class="bg-white border ${sk.enabled ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200/80 bg-slate-50/50 opacity-75'} rounded-xl p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div class="flex items-start justify-between gap-2 mb-1.5">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(sk.name)}">${escapeHtml(sk.name)}</span>
                  ${sk.isEssential ? '<span class="text-[9px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">essential</span>' : ''}
                </div>
                <div class="flex items-center gap-1 mt-0.5">
                  <span class="text-[9px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">${escapeHtml(sk.category || 'General')}</span>
                  <span class="text-[9px] font-medium text-slate-400">${sk.isBuiltin ? 'bawaan' : 'custom'}</span>
                </div>
              </div>

              <label class="agent-toggle shrink-0" title="${sk.isEssential ? 'Skill esensial tidak dapat dimatikan' : (sk.enabled ? 'Nonaktifkan skill' : 'Aktifkan skill')}">
                <input type="checkbox" ${sk.enabled ? 'checked' : ''} ${sk.isEssential ? 'disabled' : ''} onchange="toggleSkill('${sk.name}', this.checked)">
                <span class="agent-slider"></span>
              </label>
            </div>

            <p class="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-2" title="${escapeHtml(sk.description || '')}">
              ${escapeHtml(sk.description || 'Tidak ada deskripsi.')}
            </p>
          </div>
        </div>
      `).join('');

      lucide.createIcons();
    }

    function toggleToolset(id, enabled) {
      const ts = (currentAgentAbilities.toolsets || []).find(t => t.id === id);
      if (ts) {
        ts.enabled = enabled;
        renderAbilitiesView();
      }
    }

    function toggleSkill(name, enabled) {
      const sk = (currentAgentAbilities.skills || []).find(s => s.name === name);
      if (sk && !sk.isEssential) {
        sk.enabled = enabled;
        renderAbilitiesView();
      }
    }

    function toggleAllToolsets(enable) {
      (currentAgentAbilities.toolsets || []).forEach(t => t.enabled = enable);
      renderAbilitiesView();
    }

    function enableAllAbilities() {
      (currentAgentAbilities.toolsets || []).forEach(t => t.enabled = true);
      (currentAgentAbilities.skills || []).forEach(s => s.enabled = true);
      renderAbilitiesView();
    }

    function filterAbilitiesSkillsByCategory(cat, btn) {
      currentAgentAbilities.activeCategory = cat;
      document.querySelectorAll('.abilities-cat-pill').forEach(el => {
        el.className = 'abilities-cat-pill px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer';
      });
      if (btn) {
        btn.className = 'abilities-cat-pill px-2.5 py-1 rounded-full font-medium bg-slate-900 text-white cursor-pointer active shadow-2xs';
      }
      renderAbilitiesSkillsGrid();
    }

    function filterAbilitiesSkills() {
      const input = document.getElementById('abilities-skills-search');
      currentAgentAbilities.searchQuery = input ? input.value : '';
      renderAbilitiesSkillsGrid();
    }

    async function saveCurrentAgentAbilities() {
      if (!currentEditAgentId) return;

      const btn = document.getElementById('abilities-save-btn');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Saving...</span>`;
        lucide.createIcons();
      }

      const disabledSkills = (currentAgentAbilities.skills || [])
        .filter(s => !s.enabled && !s.isEssential)
        .map(s => s.name);

      const disabledToolsets = (currentAgentAbilities.toolsets || [])
        .filter(t => !t.enabled)
        .map(t => t.id);

      try {
        const { ok: abSaveOk, data } = await apiFull(`/api/profiles/${currentEditAgentId}/abilities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabledSkills, disabledToolsets })
        });

        if (abSaveOk && data.success) {
          if (btn) {
            btn.className = 'inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-2xs transition';
            btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Tersimpan ✓</span>`;
            lucide.createIcons();
            setTimeout(() => {
              btn.disabled = false;
              btn.className = 'inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-2xs transition cursor-pointer';
              btn.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Save Abilities</span>`;
              lucide.createIcons();
            }, 2000);
          }
          // Refresh profiles to update counts in roster
          if (typeof fetchProfiles === 'function') fetchProfiles();
        } else {
          alert('Gagal menyimpan abilities: ' + (data.error || 'Unknown error'));
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            lucide.createIcons();
          }
        }
      } catch (err) {
        alert('Gagal menyimpan abilities: ' + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
          lucide.createIcons();
        }
      }
    }

    const nineRouter24Models = [
      { id: 'ag/gemini-3.8-flash-high', name: 'ag/gemini-3.8-flash-high (Gemini 3.8 Flash High)' },
      { id: 'ag/gemini-3.8-flash-medium', name: 'ag/gemini-3.8-flash-medium (Gemini 3.8 Flash Medium)' },
      { id: 'ag/gemini-3.8-flash-low', name: 'ag/gemini-3.8-flash-low (Gemini 3.8 Flash Low)' },
      { id: 'ag/gemini-3.8-flash', name: 'ag/gemini-3.8-flash (Gemini 3.8 Flash)' },
      { id: 'ag/gemini-3.7-flash-high', name: 'ag/gemini-3.7-flash-high (Gemini 3.7 Flash High)' },
      { id: 'ag/gemini-3.7-flash-medium', name: 'ag/gemini-3.7-flash-medium (Gemini 3.7 Flash Medium)' },
      { id: 'ag/gemini-3.7-flash-low', name: 'ag/gemini-3.7-flash-low (Gemini 3.7 Flash Low)' },
      { id: 'ag/gemini-3.6-flash-high', name: 'ag/gemini-3.6-flash-high (Gemini 3.6 Flash High)' },
      { id: 'ag/gemini-3.6-flash-medium', name: 'ag/gemini-3.6-flash-medium (Gemini 3.6 Flash Medium)' },
      { id: 'ag/gemini-3.6-flash-low', name: 'ag/gemini-3.6-flash-low (Gemini 3.6 Flash Low)' },
      { id: 'ag/gemini-3.5-flash-high', name: 'ag/gemini-3.5-flash-high (Gemini 3.5 Flash High)' },
      { id: 'ag/gemini-3-flash-agent', name: 'ag/gemini-3-flash-agent (Gemini 3 Flash Agent)' },
      { id: 'ag/gemini-3.5-flash-low', name: 'ag/gemini-3.5-flash-low (Gemini 3.5 Flash Low)' },
      { id: 'ag/gemini-3.5-flash-extra-low', name: 'ag/gemini-3.5-flash-extra-low (Gemini 3.5 Extra Low)' },
      { id: 'ag/gemini-pro-agent', name: 'ag/gemini-pro-agent (Gemini Pro Agent)' },
      { id: 'ag/gemini-3.1-pro-low', name: 'ag/gemini-3.1-pro-low (Gemini 3.1 Pro Low)' },
      { id: 'ag/claude-sonnet-4-6', name: 'ag/claude-sonnet-4-6 (Claude Sonnet 4.6)' },
      { id: 'ag/claude-opus-4-6-thinking', name: 'ag/claude-opus-4-6-thinking (Claude Opus 4.6 Thinking)' },
      { id: 'ag/gpt-oss-120b-medium', name: 'ag/gpt-oss-120b-medium (GPT OSS 120B Medium)' },
      { id: 'ag/gemini-3-flash', name: 'ag/gemini-3-flash (Gemini 3 Flash)' },
      { id: 'exp/deepseek-v4-flash', name: 'exp/deepseek-v4-flash (DeepSeek V4 Flash - $5/day)' },
      { id: 'exp/deepseek-v4.1-flash', name: 'exp/deepseek-v4.1-flash (DeepSeek V4.1 Flash - Free)' },
      { id: 'exp/gpt-5.6-luna', name: 'exp/gpt-5.6-luna (GPT-5.6 Luna - $5/day)' },
      { id: 'exp/qwen3.8-27b', name: 'exp/qwen3.8-27b (Qwen 3.8 27B - $5/day)' }
    ];

    const openCodeModels = [
      { id: 'opencode-free/deepseek-v4-flash-free', name: 'opencode-free/deepseek-v4-flash-free (Free)' },
      { id: 'opencode-free/muse-spark-1.3-contributor-free', name: 'opencode-free/muse-spark-1.3-contributor-free (Free)' },
      { id: 'opencode-free/muse-spark-1.2-contributor-free', name: 'opencode-free/muse-spark-1.2-contributor-free (Free)' },
      { id: 'opencode-free/nemotron-3-ultra-free', name: 'opencode-free/nemotron-3-ultra-free (Free)' },
      { id: 'opencode-free/nemotron-3.5-lightning-free', name: 'opencode-free/nemotron-3.5-lightning-free (Free)' },
      { id: 'opencode-free/mimo-v2.5-free', name: 'opencode-free/mimo-v2.5-free (Free)' },
      { id: 'opencode-free/glm-5.2', name: 'opencode-free/glm-5.2 (Free)' },
      { id: 'opencode-free/kimi-k2.5', name: 'opencode-free/kimi-k2.5 (Free)' },
      { id: 'opencode-free/qwen3.6-plus', name: 'opencode-free/qwen3.6-plus (Free)' },
      { id: 'opencode-free/big-pickle', name: 'opencode-free/big-pickle (Free)' },
      { id: 'opencode-free/hy3-free', name: 'opencode-free/hy3-free (Free)' }
    ];

    function onProviderChange(targetModel) {
      const provider = document.getElementById('edit-agent-provider-select')?.value;
      const modelSelect = document.getElementById('edit-agent-model-select');
      if (!modelSelect) return;

      let list = [];
      if (provider === '9router') {
        list = nineRouter24Models;
      } else if (provider === 'opencode-free') {
        list = openCodeModels;
      } else if (provider === 'openai-codex') {
        list = [
          { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna (OpenAI Codex)' },
          { id: 'codex-default', name: 'codex-default (OpenAI Codex)' }
        ];
      } else if (provider === 'openrouter') {
        list = [
          { id: 'openrouter/anthropic/claude-3.7-sonnet', name: 'openrouter/anthropic/claude-3.7-sonnet' },
          { id: 'openrouter/google/gemini-2.5-pro', name: 'openrouter/google/gemini-2.5-pro' },
          { id: 'openrouter/deepseek/deepseek-r1', name: 'openrouter/deepseek/deepseek-r1' }
        ];
      } else if (provider === 'nvidia') {
        list = [
          { id: 'nvidia/nvidia/nemotron-3-super-170b-a17b', name: 'nvidia/nemotron-3-super-170b-a17b' },
          { id: 'nvidia/deepseek-ai/deepseek-r1', name: 'nvidia/deepseek-ai/deepseek-r1' }
        ];
      }

      modelSelect.innerHTML = list.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

      const mToSet = targetModel || (list.length > 0 ? list[0].id : '');
      if (mToSet) {
        if (!list.some(m => m.id === mToSet)) {
          const opt = document.createElement('option');
          opt.value = mToSet;
          opt.textContent = `${mToSet} (Configured)`;
          modelSelect.appendChild(opt);
        }
        modelSelect.value = mToSet;
      }
    }

    function closeEditAgent() {
      const teamView = document.getElementById('view-team');
      const editAgentView = document.getElementById('view-edit-agent');
      const pageTitle = document.getElementById('page-title');

      if (editAgentView) editAgentView.classList.add('hidden');
      if (teamView) teamView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Team';
      renderTeamView();
    }

    function switchEditAgentTab(tabName) {
      const tabs = ['identity', 'model', 'services', 'abilities', 'advanced', 'danger'];
      tabs.forEach(t => {
        const btn = document.getElementById(`edit-tab-${t}`);
        const pane = document.getElementById(`edit-pane-${t}`);
        if (btn) {
          if (t === tabName) {
            btn.className = `px-3.5 py-2 rounded-lg font-semibold bg-white ${t === 'danger' ? 'text-red-600 border border-red-200' : 'text-blue-600 border border-slate-200/80 shadow-xs'} flex items-center gap-1.5 transition`;
          } else {
            btn.className = `px-3.5 py-2 rounded-lg font-medium ${t === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'} border border-transparent flex items-center gap-1.5 transition`;
          }
        }
        if (pane) {
          if (t === tabName) pane.classList.remove('hidden');
          else pane.classList.add('hidden');
        }
      });
      if (tabName === 'abilities' && currentEditAgentId) {
        loadAgentAbilities(currentEditAgentId);
      }
      lucide.createIcons();
    }

    async function saveAgentActiveStatus() {
      if (!currentEditAgentId) return;
      const chk = document.getElementById('edit-agent-active-checkbox');
      const active = chk ? chk.checked : true;
      try {
        await apiFull(`/api/profiles/${currentEditAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
        });
      } catch (err) {}
    }

    async function saveAgentRename() {
      if (!currentEditAgentId) return;
      const newName = document.getElementById('edit-agent-name-input')?.value?.trim();
      if (!newName) return;
      alert(`Name: ${newName}`);
    }

    async function saveAgentDescription() {
      if (!currentEditAgentId) return;
      const desc = document.getElementById('edit-agent-desc-input')?.value?.trim();
      try {
        const { ok: descSaveOk } = await apiFull(`/api/profiles/${currentEditAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc })
        });
        if (descSaveOk) {
          document.getElementById('edit-agent-subtitle').textContent = desc;
          alert('Description saved successfully!');
          fetchLiveMetrics();
        } else {
          alert('Failed to save description');
        }
      } catch (err) {
        alert('Error saving description: ' + err.message);
      }
    }

    async function autoWriteAgentDescription() {
      if (!currentEditAgentId) return;
      const desc = document.getElementById('edit-agent-desc-input')?.value?.trim();
      try {
        const { ok: personaOk, data: personaData } = await apiFull('/api/generate-persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: currentEditAgentId, description: desc })
        });
        if (personaOk) {
          const d = personaData;
          if (d.persona) {
            document.getElementById('edit-agent-persona-input').value = d.persona;
            alert('Auto-write generated new persona!');
          }
        }
      } catch (err) {
        alert('Error generating persona: ' + err.message);
      }
    }

    async function saveAgentPersona() {
      if (!currentEditAgentId) return;
      const persona = document.getElementById('edit-agent-persona-input')?.value;
      try {
        const { ok: personaSaveOk } = await apiFull(`/api/profiles/${currentEditAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona })
        });
        if (personaSaveOk) {
          alert('Persona (SOUL.md) saved successfully!');
        } else {
          alert('Failed to save persona');
        }
      } catch (err) {
        alert('Error saving persona: ' + err.message);
      }
    }

    async function saveAgentModelSettings() {
      if (!currentEditAgentId) return;
      const model = document.getElementById('edit-agent-model-select')?.value;
      const fallbackModel = document.getElementById('edit-agent-fallback-input')?.value;
      const temperature = parseFloat(document.getElementById('edit-agent-temp-input')?.value || '0.7');
      try {
        const { ok: modelSaveOk } = await apiFull(`/api/profiles/${currentEditAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, fallbackModel, temperature })
        });
        if (modelSaveOk) {
          alert('Model settings saved successfully!');
          fetchLiveMetrics();
        } else {
          alert('Failed to save model settings');
        }
      } catch (err) {
        alert('Error saving model: ' + err.message);
      }
    }

    async function saveAgentServices() {
      if (!currentEditAgentId) return;
      const telegramTopicId = document.getElementById('edit-agent-topic-id')?.value?.trim();
      try {
        const { ok: svcSaveOk } = await apiFull(`/api/profiles/${currentEditAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramTopicId })
        });
        if (svcSaveOk) {
          alert('Telegram topic binding saved successfully!');
        } else {
          alert('Failed to save service settings');
        }
      } catch (err) {
        alert('Error saving service: ' + err.message);
      }
    }

    async function setAgentActive(id) {
      document.querySelectorAll('.agent-dropdown-menu').forEach(m => m.classList.add('hidden'));
      try {
        const { ok: setActiveOk } = await apiFull(`/api/profiles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true })
        });
        if (setActiveOk) {
          alert(`Agent ${id} set as active!`);
          fetchLiveMetrics();
        }
      } catch (err) {}
    }

    async function deleteAgentProfile(id) {
      document.querySelectorAll('.agent-dropdown-menu').forEach(m => m.classList.add('hidden'));
      if (id === 'default') {
        alert('Cannot delete default profile');
        return;
      }
      if (!confirm(`Are you sure you want to delete profile "${id}"?`)) return;

      try {
        const { ok: delOk, data: delData } = await apiFull(`/api/profiles/${id}`, { method: 'DELETE' });
        if (delOk) {
          alert(`Profile ${id} deleted`);
          fetchLiveMetrics();
          if (currentEditAgentId === id) {
            closeEditAgent();
          }
        } else {
          const err = delData;
          alert('Error: ' + (err.error || 'Failed to delete'));
        }
      } catch (e) {
        alert('Delete error: ' + e.message);
      }
    }

    function confirmDeleteCurrentEditAgent() {
      if (currentEditAgentId) {
        deleteAgentProfile(currentEditAgentId);
      }
    }

    function openDocsForCurrentEditAgent() {
      if (currentEditAgentId) {
        currentDocsAgent = currentEditAgentId;
        switchNavByName('Documents');
      }
    }

    function normalizeKanbanTask(t) {
      const prioMap = { 3: 'P100', 2: 'P1', 1: 'P2', 0: 'P3' };
      const p = prioMap[t.priority] || (t.priority === 0 ? 'P3' : 'P1');
      const displayId = 't_' + (t.id || '').replace(/^task-/, '').substring(0, 8);
      const dateCreated = t.createdAt ? new Date(t.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recently';
      
      let mappedStatus = t.status || 'backlog';
      if (mappedStatus === 'running') mappedStatus = 'in_progress';
      if (mappedStatus === 'todo' || mappedStatus === 'triage') mappedStatus = 'backlog';

      return {
        id: t.id,
        displayId: displayId,
        priority: p,
        title: t.title,
        description: t.body || t.title,
        fullReport: t.body || t.title,
        result: t.body || 'Task registered and verified in Kanban workflow.',
        assignee: t.assignee || 'default',
        status: mappedStatus,
        created: dateCreated,
        counter: 1
      };
    }

    // Live Kanban tasks arrive via fetchLiveMetrics (/api/kanban); empty until loaded.
    let liveKanbanTasks = [];

    let currentTaskDetailId = null;

    async function updateCurrentTask(status) {
      if (!currentTaskDetailId) return;
      await api(`/api/kanban/tasks/${encodeURIComponent(currentTaskDetailId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, 'Task update failed');
      await fetchLiveMetrics();
      closeTaskDetail();
    }
    async function unblockCurrentTask() {
      if (!currentTaskDetailId) return;
      try {
        await api(`/api/kanban/tasks/${encodeURIComponent(currentTaskDetailId)}/unblock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Unblocked from dashboard' }) }, 'Unblock failed');
        await fetchLiveMetrics(); closeTaskDetail();
      } catch (err) { alert(err.message); }
    }
    async function reopenCurrentTask() { try { await updateCurrentTask('ready'); } catch (err) { alert(err.message); } }
    async function archiveCurrentTask() { if (!confirm('Archive this task?')) return; try { await updateCurrentTask('archived'); } catch (err) { alert(err.message); } }
    async function addTaskComment() {
      const input = document.getElementById('task-comment-input'); const comment = input?.value.trim();
      if (!comment || !currentTaskDetailId) return;
      try { await api(`/api/kanban/tasks/${encodeURIComponent(currentTaskDetailId)}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) }, 'Comment failed'); input.value = ''; alert('Comment added.'); } catch (err) { alert(err.message); }
    }
    function openTaskWorkspaceFiles() {
      closeTaskDetail();
      switchNavByName('Documents');
    }

    function editCurrentTask() {
      const task = liveKanbanTasks.find(t => t.id === currentTaskDetailId); if (!task) return;
      const title = prompt('Task title', task.title); if (!title?.trim()) return;
      const body = prompt('Task details', task.description || task.body || '');
      api(`/api/kanban/tasks/${encodeURIComponent(task.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), body: body || '' }) }, 'Task edit failed').then(async () => { await fetchLiveMetrics(); openTaskDetail(task.id); }).catch(err => alert(err.message));
    }

    function openTaskDetail(id) {
      currentTaskDetailId = id;
      const task = liveKanbanTasks.find(t => t.id === id) || liveKanbanTasks[0];
      if (!task) return;
      document.querySelector('[onclick="unblockCurrentTask()"]').classList.toggle('hidden', task.status !== 'blocked');
      
      const statusBadge = document.getElementById('task-detail-status-badge');
      const priorityBadge = document.getElementById('task-detail-priority-badge');
      const assigneeBadge = document.getElementById('task-detail-assignee-badge');
      
      const statusMap = {
        done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
        blocked: { label: 'Blocked', cls: 'bg-amber-100 text-amber-800' },
        in_progress: { label: 'In Progress', cls: 'bg-indigo-100 text-indigo-800' },
        ready: { label: 'Ready', cls: 'bg-amber-100 text-amber-800' },
        backlog: { label: 'Backlog', cls: 'bg-slate-100 text-slate-800' }
      };
      const st = statusMap[task.status] || statusMap.done;
      statusBadge.textContent = st.label;
      statusBadge.className = `${st.cls} text-xs font-semibold px-2.5 py-0.5 rounded-full`;

      priorityBadge.textContent = task.priority || 'P100';
      assigneeBadge.textContent = task.assignee || 'coder';

      document.getElementById('task-detail-id').textContent = task.displayId || '—';
      document.getElementById('task-detail-title').textContent = task.title;
      document.getElementById('task-detail-subtitle').textContent = task.status === 'done' ? 'Completed.' : (task.status === 'blocked' ? 'Blocked — action required.' : (task.status === 'in_progress' ? 'In progress.' : 'Pending.'));
      
      document.getElementById('task-detail-desc').textContent = task.description || task.result || 'No description provided.';

      document.getElementById('task-meta-assignee').textContent = task.assignee;
      document.getElementById('task-meta-priority').textContent = task.priority || 'P100';
      document.getElementById('task-meta-created').textContent = task.created || '2 months ago';
      document.getElementById('task-meta-workspace').textContent = `~/.hermes/kanban/workspaces/${task.displayId || '<id>'}`;

      // Update Tracking Status Timeline
      const timeAgo = task.created || '2 months ago';
      const cTime = document.getElementById('timeline-completed-time');
      const fTime = document.getElementById('timeline-finished-time');
      const sTime = document.getElementById('timeline-started-time');
      const crTime = document.getElementById('timeline-created-time');
      if (cTime) cTime.textContent = timeAgo;
      if (fTime) fTime.textContent = timeAgo;
      if (sTime) sTime.textContent = timeAgo;
      if (crTime) crTime.textContent = timeAgo;

      const workerEl = document.getElementById('timeline-worker-name');
      if (workerEl) workerEl.textContent = task.assignee || 'coder';

      const prioEl = document.getElementById('timeline-created-priority');
      if (prioEl) prioEl.textContent = task.priority || 'P100';

      const reportBox = document.getElementById('timeline-report-box');
      if (reportBox) {
        reportBox.textContent = task.fullReport || task.result || 'No execution report available.';
      }

      document.getElementById('task-modal-overlay').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeTaskDetail() {
      document.getElementById('task-modal-overlay').classList.add('hidden');
    }

    function handleModalBackdropClick(event) {
      if (event.target.id === 'task-modal-overlay') {
        closeTaskDetail();
      }
    }

    function copyTaskId() {
      const id = document.getElementById('task-detail-id')?.innerText;
      if (id) {
        navigator.clipboard.writeText(id);
        alert('Copied Task ID: ' + id);
      }
    }

    function copyWorkspacePath() {
      const p = document.getElementById('task-meta-workspace')?.innerText;
      if (p) {
        navigator.clipboard.writeText(p);
        alert('Copied workspace path: ' + p);
      }
    }

    const defaultKanbanColumns = [
      { id: 'backlog', label: 'Backlog', tone: 'slate', empty: 'No tasks in backlog' },
      { id: 'ready', label: 'Ready', tone: 'slate', empty: 'No ready tasks' },
      { id: 'in_progress', label: 'In Progress', tone: 'indigo', empty: 'No active tasks' },
      { id: 'done', label: 'Done', tone: 'emerald', empty: 'No completed tasks' }
    ];
    let kanbanColumns = JSON.parse(localStorage.getItem('kanban-columns') || 'null') || defaultKanbanColumns;
    let kanbanSort = JSON.parse(localStorage.getItem('kanban-column-sort') || '{}');
    function persistKanbanColumns() { localStorage.setItem('kanban-columns', JSON.stringify(kanbanColumns)); localStorage.setItem('kanban-column-sort', JSON.stringify(kanbanSort)); }
    function sortKanbanCards(cards, mode) { return [...cards].sort((a,b) => mode === 'name' ? a.title.localeCompare(b.title) : mode === 'priority' ? String(a.priority).localeCompare(String(b.priority), undefined, {numeric:true}) : (b.createdAt || 0) - (a.createdAt || 0)); }
    function renderKanbanView() {
      const af = document.getElementById('kanban-assignee-filter');
      if (af) {
        const curA = af.value || 'all';
        const aIds = ['all', ...new Set(liveKanbanTasks.map(t => (t.assignee || 'default').toLowerCase()))];
        af.innerHTML = aIds.map(id => `<option value="${id}">${id === 'all' ? 'All assignees' : id}</option>`).join('');
        af.value = aIds.includes(curA) ? curA : 'all';
      }
      const nta = document.getElementById('new-task-assignee');
      if (nta) {
        const curN = nta.value || 'default';
        const pIds = globalProfiles.length ? globalProfiles.map(x => x.id) : ['default'];
        nta.innerHTML = pIds.map(id => `<option value="${id}">${id}</option>`).join('');
        nta.value = pIds.includes(curN) ? curN : pIds[0];
      }
      const assignee = (document.getElementById('kanban-assignee-filter')?.value || 'all').toLowerCase();
      const query = (document.getElementById('kanban-search')?.value || '').toLowerCase();
      const tasks = liveKanbanTasks.filter(t => (assignee === 'all' || (t.assignee || '').toLowerCase() === assignee) && (!query || `${t.title} ${t.result || ''} ${t.description || ''}`.toLowerCase().includes(query)));
      const blockedStrip = document.getElementById('kanban-blocked-strip');
      const blockedTasks = liveKanbanTasks.filter(t => t.status === 'blocked');
      if (blockedStrip) {
        blockedStrip.classList.toggle('hidden', blockedTasks.length === 0);
        blockedStrip.innerHTML = blockedTasks.length ? `<strong>${blockedTasks.length} blocked task(s)</strong> — exception state, not a workflow column. Open task detail to unblock.` : '';
      }
      const grid = document.getElementById('kanban-columns-grid'); if (!grid) return;
      const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
      const card = t => `<div draggable="true" ondragstart="dragKanbanTask(event,'${esc(t.id)}')" ondragend="endKanbanDrag(event)" onclick="openTaskDetail('${esc(t.id)}')" class="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing flex flex-col gap-2" data-task-id="${esc(t.id)}"><div class="flex items-center gap-2 flex-wrap"><span class="bg-blue-50 text-blue-600 border border-blue-200/80 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">${esc(t.priority)}</span><h4 class="text-xs font-semibold text-slate-900 leading-snug flex-1">${esc(t.title)}</h4></div><div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 mb-1">RESULT</div><div class="bg-slate-50 border border-slate-100 rounded p-2 text-[11px] text-slate-600 font-mono leading-relaxed line-clamp-3">${esc(t.result)}</div><div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-1"><span class="text-[10px] font-medium text-slate-700">${esc(t.assignee)}</span><span class="text-[11px] text-slate-400">${esc(t.counter)}</span></div></div>`;
      grid.innerHTML = kanbanColumns.map((col, i) => { const cards = sortKanbanCards(tasks.filter(t => t.status === col.id), kanbanSort[col.id] || 'date'); const tone = col.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : col.tone === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200/80 text-slate-600'; return `<div ondragover="allowKanbanDrop(event)" ondragenter="enterKanbanDrop(event)" ondragleave="leaveKanbanDrop(event)" ondrop="dropKanbanTask(event,'${esc(col.id)}')" class="bg-slate-100/60 rounded-xl p-3 border border-slate-200/60 flex flex-col gap-3 min-h-[480px]"><div class="flex items-center justify-between px-1 pb-1"><div class="flex items-center gap-2"><span class="text-xs font-bold text-slate-700">${esc(col.label)}</span><span class="${tone} text-[10px] font-bold px-2 py-0.5 rounded-full">${cards.length}</span></div><div class="relative"><button onclick="toggleKanbanColumnMenu(event,'${esc(col.id)}')" class="text-slate-400 hover:text-slate-600 text-xs font-bold px-1">⋮</button><div id="kanban-menu-${esc(col.id)}" class="hidden absolute right-0 top-6 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-xl p-1 text-xs"><button onclick="sortKanbanColumn('${esc(col.id)}','date')" class="w-full text-left px-3 py-2 hover:bg-slate-50 rounded">Sort by date</button><button onclick="sortKanbanColumn('${esc(col.id)}','priority')" class="w-full text-left px-3 py-2 hover:bg-slate-50 rounded">Sort by priority</button><button onclick="sortKanbanColumn('${esc(col.id)}','name')" class="w-full text-left px-3 py-2 hover:bg-slate-50 rounded">Sort by name</button><div class="border-t border-slate-100 my-1"></div><button onclick="moveKanbanColumn('${esc(col.id)}',-1)" class="w-full text-left px-3 py-2 hover:bg-slate-50 rounded">Move left</button><button onclick="moveKanbanColumn('${esc(col.id)}',1)" class="w-full text-left px-3 py-2 hover:bg-slate-50 rounded">Move right</button><button onclick="deleteKanbanColumnTasks('${esc(col.id)}')" class="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 rounded">Delete tasks</button></div></div></div><div class="flex flex-col gap-2.5">${cards.map(card).join('') || `<div class="text-xs text-slate-400 text-center py-8">${esc(col.empty)}</div>`}</div></div>`; }).join(''); lucide.createIcons();
    }
    function toggleKanbanColumnMenu(e,id) { e.stopPropagation(); document.querySelectorAll('[id^="kanban-menu-"]').forEach(m => m.id !== `kanban-menu-${id}` && m.classList.add('hidden')); document.getElementById(`kanban-menu-${id}`)?.classList.toggle('hidden'); }
    function sortKanbanColumn(id,mode) { kanbanSort[id] = mode; persistKanbanColumns(); renderKanbanView(); }
    function moveKanbanColumn(id,direction) { const i=kanbanColumns.findIndex(c=>c.id===id), j=i+direction; if(i<0||j<0||j>=kanbanColumns.length)return; [kanbanColumns[i],kanbanColumns[j]]=[kanbanColumns[j],kanbanColumns[i]]; persistKanbanColumns(); renderKanbanView(); }
    async function deleteKanbanColumnTasks(id) {
      const tasks = liveKanbanTasks.filter(t => t.status === id);
      if (!tasks.length) return alert('No tasks in this column.');
      const col = kanbanColumns.find(c => c.id === id);
      if (!confirm(`Delete ${tasks.length} task(s) from "${col?.label || id}"? This cannot be undone.`)) return;
      try {
        const results = await Promise.all(tasks.map(t => apiFull(`/api/kanban/tasks/${encodeURIComponent(t.id)}`, { method: 'DELETE' })));
        if (results.some(r => !r.ok)) throw new Error('One or more tasks failed to delete');
        await fetchLiveMetrics();
        renderKanbanView();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
    function allowKanbanDrop(event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    function enterKanbanDrop(event) { event.preventDefault(); event.currentTarget.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50/40'); }
    function leaveKanbanDrop(event) { event.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/40'); }
    function dragKanbanTask(event, id) { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); event.currentTarget.classList.add('opacity-50'); }
    function endKanbanDrag(event) { event.currentTarget.classList.remove('opacity-50'); document.querySelectorAll('#kanban-columns-grid > div').forEach(el => el.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/40')); }
    async function dropKanbanTask(event, status) {
      event.preventDefault(); event.stopPropagation(); leaveKanbanDrop(event);
      const id = event.dataTransfer.getData('text/plain');
      const task = liveKanbanTasks.find(t => t.id === id);
      if (!task || task.status === status) return;
      const oldStatus = task.status; task.status = status; renderKanbanView();
      try {
        await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, 'Task status update failed');
        await fetchLiveMetrics();
      } catch (err) {
        task.status = oldStatus; renderKanbanView(); alert('Move failed: ' + err.message);
      }
    }
    function filterKanbanCards() { renderKanbanView(); }

    let currentScheduleMode = 'list';
    let currentScheduleDate = new Date(); // real current date

    // Cron jobs are loaded live from /api/schedules (Hermes cron stores across all profiles).
    let liveScheduleJobs = [];

