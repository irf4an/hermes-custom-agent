    lucide.createIcons();

    // Placeholder until live profiles arrive via fetchLiveMetrics
    const agentsData = [
      { name: 'default', label: 'Local Hermes', tag: 'default', online: true },
    ];

    let globalSessionsData = null;

    // Deployment-specific paths are supplied by the backend (HERMES_HOME, AGENT_WORKSPACE_DIR,
    // /api/drive/deliverables -> rootFolder). The constants below are pre-fetch placeholders only.
    let driveRootFolder = '~/workspace';
    const shortHermes = (p) => String(p || '').replace(/^\S*?\/\.hermes/, '~');
    const agentFolder = (id) => `${driveRootFolder.replace(/\/$/, '')}/${id}/`;


    // Neutral display metadata derived from the agent id + live profile data.
    // No hardcoded team names: cloners see their own agents here.
    const capAgentId = (id) => id === 'default' ? 'Default' : String(id).charAt(0).toUpperCase() + String(id).slice(1);
    const profileNameFor = (id) => (globalProfiles.find(p => p.id === id)?.name) || capAgentId(id);
    const hashPick = (id, arr) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
    const META_ICONS = ['user-check', 'compass', 'binary', 'pen-tool', 'palette', 'radar'];
    const META_COLORS = ['indigo', 'blue', 'emerald', 'amber', 'purple', 'rose'];
    const agentMetaFor = (id) => ({ name: profileNameFor(id), role: 'Agent', icon: hashPick(id, META_ICONS), color: hashPick(id, META_COLORS) });
    const CHAT_BADGES = ['bg-amber-50 text-amber-700 border-amber-200', 'bg-indigo-50 text-indigo-700 border-indigo-200', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-pink-50 text-pink-700 border-pink-200', 'bg-blue-50 text-blue-700 border-blue-200'];
    const chatBadgeFor = (profile) => ({ badge: hashPick(profile || 'x', CHAT_BADGES), name: profileNameFor(profile || 'x') });

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

    // ===== Minimal cron engine (5-field: min hour dom mon dow) =====
    const CRON_MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const CRON_DOWS = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };

    function cronFieldSet(field, min, max, names) {
      const out = new Set();
      const addRange = (a, b, step) => {
        step = step && step > 0 ? step : 1;
        for (let v = a; v <= b; v += step) out.add(v);
      };
      const norm = (tok) => {
        const t = String(tok).trim().toLowerCase();
        if (!t) return null;
        if (names && names[t] !== undefined) return names[t];
        const n = parseInt(t, 10);
        return isNaN(n) ? null : n;
      };
      for (const partRaw of String(field).split(',')) {
        const part = partRaw.trim();
        if (!part) continue;
        const slash = part.split('/');
        const body = slash[0];
        const step = slash.length > 1 ? parseInt(slash[1], 10) : 1;
        if (body === '*' || body === '?') {
          addRange(min, max, step);
          continue;
        }
        const dash = body.split('-');
        if (dash.length === 2) {
          const a = norm(dash[0]), b = norm(dash[1]);
          if (a === null || b === null) continue;
          addRange(Math.min(a, b), Math.max(a, b), step);
          continue;
        }
        const v = norm(body);
        if (v === null) continue;
        if (slash.length > 1) addRange(v, max, step);
        else out.add(v);
      }
      return out;
    }

    // Returns {mins,hours,doms,months,dows, domRestricted, dowRestricted} or null when unparseable.
    function parseCron(expr) {
      const parts = String(expr || '').trim().split(/\s+/);
      if (parts.length !== 5) return null;
      const mins = cronFieldSet(parts[0], 0, 59);
      const hours = cronFieldSet(parts[1], 0, 23);
      const doms = cronFieldSet(parts[2], 1, 31);
      const months = cronFieldSet(parts[3], 1, 12, CRON_MONTHS);
      const dows = cronFieldSet(parts[4], 0, 7, CRON_DOWS);
      if (dows.has(7)) dows.add(0);
      if (!mins.size || !hours.size || !doms.size || !months.size || !dows.size) return null;
      return {
        mins, hours, doms, months, dows,
        domRestricted: parts[2].trim() !== '*' && parts[2].trim() !== '?',
        dowRestricted: parts[4].trim() !== '*' && parts[4].trim() !== '?'
      };
    }

    function cronMatchesDate(parsed, date) {
      if (!parsed) return false;
      if (!parsed.months.has(date.getMonth() + 1)) return false;
      const domOk = parsed.doms.has(date.getDate());
      const dowOk = parsed.dows.has(date.getDay());
      // Standard cron: when both DOM and DOW are restricted, either may match.
      if (parsed.domRestricted && parsed.dowRestricted) return domOk || dowOk;
      if (parsed.domRestricted) return domOk;
      if (parsed.dowRestricted) return dowOk;
      return true;
    }

    // Occurrences of a job on a given local calendar day.
    function cronOccurrencesOnDay(job, date) {
      const expr = job.schedule_display || job.schedule;
      let parsed = parseCron(expr);
      if (!parsed) {
        // Interval-style schedules ("every 10m" / "every 2h") — Hermes stores these verbatim.
        const m = String(expr || '').match(/^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours)$/i);
        if (!m) return [];
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const stepMin = unit.startsWith('h') ? n * 60 : n;
        if (!stepMin) return [];
        const times = [];
        for (let mm = 0; mm < 24 * 60; mm += stepMin) {
          times.push({ hour: Math.floor(mm / 60), minute: mm % 60 });
        }
        return times;
      }
      if (!cronMatchesDate(parsed, date)) return [];
      const times = [];
      const hours = [...parsed.hours].sort((a, b) => a - b);
      const mins = [...parsed.mins].sort((a, b) => a - b);
      for (const h of hours) for (const mm of mins) times.push({ hour: h, minute: mm });
      return times;
    }

    function cronTimeLabel(t) {
      return String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0');
    }

    // One entry per job per day: earliest run time + total run count.
    // High-frequency jobs (every 5m) would otherwise emit ~288 rows for a single day.
    function jobsForDay(date) {
      const out = [];
      for (const job of liveScheduleJobs) {
        const times = cronOccurrencesOnDay(job, date);
        if (!times.length) continue;
        times.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
        out.push({
          job,
          time: cronTimeLabel(times[0]),
          sort: times[0].hour * 60 + times[0].minute,
          runs: times.length,
          allTimes: times.map(cronTimeLabel)
        });
      }
      return out.sort((a, b) => a.sort - b.sort);
    }

    function scheduleJobCard(job, active, showTime, runs) {
      // ponytail: click opens edit drawer; full hover tip displays schedule details
      const dim = active ? '' : ' opacity-60';
      const count = runs > 1 ? `<span class="ml-1 font-mono text-[9px] opacity-70">x${runs}</span>` : '';
      const dot = active
        ? `<span class="inline-block w-1 h-1 rounded-full ${job.deliver === 'telegram' ? 'bg-blue-500' : 'bg-emerald-500'} mr-1 align-middle"></span>`
        : '<span class="inline-block w-1 h-1 rounded-full bg-slate-400 mr-1 align-middle"></span>';
      const timePart = showTime ? `<span class="font-mono opacity-70 mr-1">${showTime}</span>` : '';
      const tip = `${job.name} — ${job.schedule_display || job.schedule}${runs > 1 ? ` (${runs} runs/day)` : ''} (klik untuk edit)`;
      if (job.deliver === 'telegram') {
        return `<div onclick="openEditSchedule('${job.id}')" class="bg-blue-50 border border-blue-200/70 hover:bg-blue-100 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 truncate cursor-pointer transition${dim}" title="${escapeHtml(tip)}">${dot}${timePart}${escapeHtml(job.name)}${count}</div>`;
      }
      return `<div onclick="openEditSchedule('${job.id}')" class="bg-slate-100 hover:bg-slate-200/80 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-700 truncate cursor-pointer transition${dim}" title="${escapeHtml(tip)}">${dot}${timePart}${escapeHtml(job.name)}${count}</div>`;
    }

    async function fetchSchedules() {
      try {
        const d = await api('/api/schedules', {}, 'Gagal memuat jadwal');
        {
          if (Array.isArray(d.schedules)) {
            liveScheduleJobs = d.schedules;
            renderScheduleView();
            updateScheduleDateDisplay();
          }
        }
      } catch (e) {
        console.error('Error fetching schedules:', e);
      }
    }

    async function triggerScheduleRun(id) {
      const button = document.querySelector(`[data-run-schedule="${id}"]`);
      if (button) button.disabled = true;
      try {
        const { status, data } = await apiFull(`/api/schedules/${id}/run`, { method: 'POST' });
        if (status === 202 && data.state === 'queued') {
          alert('Schedule queued. Output akan dikirim Telegram setelah agent selesai.');
        } else if (status === 409 && data.state === 'already_running') {
          alert('Schedule masih berjalan. Tunggu output atau cek log run.');
        } else {
          throw new Error(data.error || data.message || 'Failed to trigger schedule');
        }
        await fetchSchedules();
      } catch (e) {
        alert('Run gagal: ' + e.message);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function toggleSchedulePause(id, isCurrentlyEnabled) {
      const action = isCurrentlyEnabled ? 'pause' : 'resume';
      try {
        const { ok } = await apiFull(`/api/schedules/${id}/${action}`, { method: 'POST' });
        if (ok) {
          await fetchSchedules();
        } else {
          alert(`Failed to ${action} schedule`);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    async function deleteScheduleJob(id) {
      if (!confirm(`Hapus jadwal cron ${id}?`)) return;
      try {
        const { ok } = await apiFull(`/api/schedules/${id}`, { method: 'DELETE' });
        if (ok) {
          await fetchSchedules();
        } else {
          alert('Failed to delete schedule');
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    const scheduleOutputOpen = {};
    function toggleScheduleOutput(id) {
      scheduleOutputOpen[id] = !scheduleOutputOpen[id];
      renderScheduleListView();
    }

    let currentEditScheduleId = null;

    function openEditSchedule(id) {
      currentEditScheduleId = id;
      const job = liveScheduleJobs.find(x => x.id === id);
      if (!job) return;

      const scheduleView = document.getElementById('view-schedule');
      const editScheduleView = document.getElementById('view-edit-schedule');
      const pageTitle = document.getElementById('page-title');

      if (scheduleView) scheduleView.classList.add('hidden');
      if (editScheduleView) editScheduleView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Edit schedule';

      document.getElementById('edit-schedule-title').textContent = job.name || job.id;
      document.getElementById('edit-schedule-subtitle').textContent = `${job.schedule_display || job.schedule || ''} · ${job.deliver || 'local'} · ${job.model || 'model resolution'}`;

      const activeCheckbox = document.getElementById('edit-sched-active-checkbox');
      if (activeCheckbox) activeCheckbox.checked = job.enabled !== false;

      document.getElementById('edit-sched-name-input').value = job.name || '';
      document.getElementById('edit-sched-expr-input').value = job.schedule_display || job.schedule || '';
      document.getElementById('edit-sched-deliver-select').value = job.deliver || 'local';
      document.getElementById('edit-sched-prompt-input').value = job.prompt || '';

      const agentSelect = document.getElementById('edit-sched-agent-select');
      if (agentSelect) {
        const availableAgents = (globalProfiles && globalProfiles.length > 0)
          ? globalProfiles.map(p => ({ id: p.id, label: `${p.name || p.id} (${p.id})` }))
          : [
              { id: 'default', label: 'Default' }
            ];

        agentSelect.innerHTML = availableAgents.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
        agentSelect.value = job.recipient_agent || job.agent || 'default';
      }

      const providerSelect = document.getElementById('edit-sched-provider-select');
      if (providerSelect) {
        if (job.provider) {
          providerSelect.value = job.provider;
        } else if (job.model && (job.model.startsWith('opencode') || job.model.startsWith('opencode-free/'))) {
          providerSelect.value = 'opencode-free';
        } else if (job.model && (job.model.includes('codex') || job.model === 'gpt-5.6-luna')) {
          providerSelect.value = 'openai-codex';
        } else if (job.model && job.model.includes('openrouter')) {
          providerSelect.value = 'openrouter';
        } else if (job.model && job.model.includes('nvidia')) {
          providerSelect.value = 'nvidia';
        } else {
          providerSelect.value = '9router';
        }
        onSchedProviderChange(job.model);
      }

      const reasoningSelect = document.getElementById('edit-sched-reasoning-select');
      if (reasoningSelect) {
        reasoningSelect.value = job.reasoning_effort || 'default';
      }

      switchEditScheduleTab('job');
      lucide.createIcons();
    }

    function closeEditSchedule() {
      const scheduleView = document.getElementById('view-schedule');
      const editScheduleView = document.getElementById('view-edit-schedule');
      const pageTitle = document.getElementById('page-title');

      if (editScheduleView) editScheduleView.classList.add('hidden');
      if (scheduleView) scheduleView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Schedule';
      lucide.createIcons();
    }

    function switchEditScheduleTab(tab) {
      const tabs = ['job', 'model', 'danger'];
      tabs.forEach(t => {
        const btn = document.getElementById(`edit-sched-tab-${t}`);
        const pane = document.getElementById(`edit-sched-pane-${t}`);
        if (!btn || !pane) return;
        if (t === tab) {
          btn.className = 'px-3.5 py-2 rounded-lg font-semibold bg-white text-blue-600 border border-slate-200/80 shadow-xs flex items-center gap-1.5 transition cursor-pointer';
          pane.classList.remove('hidden');
        } else {
          const isDanger = t === 'danger';
          btn.className = isDanger
            ? 'px-3.5 py-2 rounded-lg font-medium text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1.5 transition cursor-pointer'
            : 'px-3.5 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-1.5 transition cursor-pointer';
          pane.classList.add('hidden');
        }
      });
      lucide.createIcons();
    }

    function onSchedProviderChange(targetModel) {
      const provider = document.getElementById('edit-sched-provider-select')?.value;
      const modelSelect = document.getElementById('edit-sched-model-select');
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

    function setSchedPreset(expr) {
      const input = document.getElementById('edit-sched-expr-input');
      if (input) input.value = expr;
    }

    async function saveScheduleJobDetails() {
      if (!currentEditScheduleId) return;
      const name = document.getElementById('edit-sched-name-input')?.value?.trim();
      const schedule = document.getElementById('edit-sched-expr-input')?.value?.trim();
      const deliver = document.getElementById('edit-sched-deliver-select')?.value;
      const recipient_agent = document.getElementById('edit-sched-agent-select')?.value || 'default';
      const prompt = document.getElementById('edit-sched-prompt-input')?.value;
      const enabled = document.getElementById('edit-sched-active-checkbox')?.checked;

      if (!name) {
        alert('Job name cannot be empty');
        return;
      }
      if (!schedule) {
        alert('Schedule expression cannot be empty');
        return;
      }

      try {
        const { ok, data } = await apiFull(`/api/schedules/${currentEditScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, schedule, deliver, recipient_agent, prompt, enabled })
        });
        if (ok && data.success) {
          alert('Schedule configuration saved successfully');
          await fetchSchedules();
          closeEditSchedule();
        } else {
          alert('Failed to save schedule: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error saving schedule: ' + err.message);
      }
    }

    async function saveScheduleModelDetails() {
      if (!currentEditScheduleId) return;
      const provider = document.getElementById('edit-sched-provider-select')?.value;
      const model = document.getElementById('edit-sched-model-select')?.value;
      const reasoning_effort = document.getElementById('edit-sched-reasoning-select')?.value;

      try {
        const { ok, data } = await apiFull(`/api/schedules/${currentEditScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, reasoning_effort })
        });
        if (ok && data.success) {
          alert('Model configuration saved successfully');
          await fetchSchedules();
          closeEditSchedule();
        } else {
          alert('Failed to save model: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error saving model: ' + err.message);
      }
    }

    function renderScheduleListView() {
      const container = document.getElementById('schedule-list-view');
      if (!container) return;

      if (liveScheduleJobs.length === 0) {
        container.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">No scheduled cron jobs found in Hermes. Create one with <code>hermes cron create</code>.</div>';
        return;
      }

      container.innerHTML = liveScheduleJobs.map(job => {
        const cronExpr = job.schedule_display || job.schedule || '* * * * *';
        const nextRun = job.next_run_at ? `next: ${new Date(job.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'scheduled';
        const target = job.deliver || 'local';
        const lastRunText = job.last_run_at
          ? `Last run ${new Date(job.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${job.last_status || 'ok'}`
          : 'Awaiting execution tick · scheduled';
        const isError = job.last_status === 'error';
        const isPaused = !job.enabled;
        const executionState = job.execution_state || (isError ? 'failed' : 'idle');
        const executionLabel = { running: 'RUNNING', failed: 'FAILED', completed: 'COMPLETED', idle: 'IDLE' }[executionState] || executionState.toUpperCase();
        const executionClass = executionState === 'running' ? 'bg-blue-100 text-blue-700' : executionState === 'failed' ? 'bg-red-100 text-red-700' : executionState === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
        const outputPreview = job.output ? job.output.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(-1200) : '';
        const executionDetail = executionState === 'running' ? 'Agent sedang bekerja…' : (job.last_error || job.last_delivery_error || (outputPreview ? 'Output tersedia' : 'Belum ada output'));


        return `
          <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition ${isPaused ? 'opacity-70 bg-slate-50/50' : ''}">
            <!-- Card Header -->
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">${job.name}</h4>
                  <span class="${isPaused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'} text-[10px] font-bold px-1.5 py-0.5 rounded">${isPaused ? 'PAUSED · OFF' : 'ACTIVE · ON'}</span>
                  <span class="${executionClass} text-[10px] font-bold px-1.5 py-0.5 rounded">${executionLabel}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 mt-1">
                  <span class="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-semibold">${cronExpr}</span>
                  <span>•</span>
                  <span>${nextRun}</span>
                  <span>•</span>
                  <span class="font-mono text-slate-600 font-medium">→ ${target}</span>
                  ${job.recipient_agent ? `<span>•</span><span class="inline-flex items-center gap-1 font-medium text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[11px]"><i data-lucide="bot" class="w-3 h-3"></i><span>${job.recipient_agent}</span></span>` : ''}
                </div>
              </div>

              <!-- Action Cluster Pill -->
              <div class="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-white shadow-2xs flex-shrink-0">
                <button onclick="openEditSchedule('${job.id}')" class="p-1 hover:text-blue-600 text-slate-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Edit schedule & model">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="toggleSchedulePause('${job.id}', ${job.enabled})" class="p-1 ${job.enabled ? 'text-emerald-600 hover:text-amber-700 hover:bg-amber-50' : 'text-amber-600 hover:text-emerald-700 hover:bg-emerald-50'} rounded transition cursor-pointer" title="${job.enabled ? 'Pause schedule (turn OFF)' : 'Resume schedule (turn ON)'}" aria-label="${job.enabled ? 'Pause schedule' : 'Resume schedule'}">
                  <i data-lucide="${job.enabled ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
                </button>
                <button data-run-schedule="${job.id}" onclick="triggerScheduleRun('${job.id}')" class="p-1 hover:text-blue-600 text-slate-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Run now">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteScheduleJob('${job.id}')" class="p-1 hover:text-red-600 text-red-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Delete schedule">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <!-- Card Body -->
            <p class="text-xs text-slate-600 leading-relaxed my-3 line-clamp-2">
              ${job.prompt || 'No instruction prompt provided.'}
            </p>

            <div class="text-[11px] ${executionState === 'failed' ? 'text-red-600' : 'text-slate-500'} mb-2">${executionDetail}</div>
            ${outputPreview ? `
              <div class="mb-3">
                <button onclick="toggleScheduleOutput('${job.id}')" class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-2.5 py-1 rounded-md transition cursor-pointer">
                  <i data-lucide="${scheduleOutputOpen[job.id] ? 'chevron-up' : 'terminal'}" class="w-3.5 h-3.5 text-slate-500"></i>
                  <span>${scheduleOutputOpen[job.id] ? 'Hide output' : 'Show output'}</span>
                </button>
                <div id="schedule-output-${job.id}" class="${scheduleOutputOpen[job.id] ? '' : 'hidden'} mt-2">
                  <pre class="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 text-slate-100 p-3 text-[10px] leading-relaxed font-mono">${outputPreview}</pre>
                </div>
              </div>
            ` : ''}

            <!-- Card Footer -->
            <div class="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
              <div>
                ${isError ? `
                  <span>Last run ${lastRunText.split('·')[0]}· </span>
                  <span class="text-red-500 font-semibold font-mono">error</span>
                ` : `
                  <span>${lastRunText}</span>
                `}
              </div>

              ${job.model ? `
                <div class="font-mono text-[11px] text-slate-400">
                  model: <span class="text-slate-600">${job.model}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function getSundayOfWeek(d) {
      const date = new Date(d);
      const day = date.getDay(); // 0 is Sunday
      const diff = date.getDate() - day;
      return new Date(date.setDate(diff));
    }

    function updateScheduleDateDisplay() {
      const el = document.getElementById('schedule-date-display');
      if (!el) return;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      if (currentScheduleMode === 'month') {
        el.textContent = `${fullMonths[currentScheduleDate.getMonth()]} ${currentScheduleDate.getFullYear()}`;
      } else if (currentScheduleMode === 'week') {
        const sun = getSundayOfWeek(currentScheduleDate);
        const sat = new Date(sun);
        sat.setDate(sun.getDate() + 6);

        const mSun = months[sun.getMonth()];
        const mSat = months[sat.getMonth()];
        const ySun = sun.getFullYear();
        const ySat = sat.getFullYear();

        if (mSun === mSat && ySun === ySat) {
          el.textContent = `${mSun} ${sun.getDate()} – ${sat.getDate()}, ${ySun}`;
        } else if (ySun === ySat) {
          el.textContent = `${mSun} ${sun.getDate()} – ${mSat} ${sat.getDate()}, ${ySun}`;
        } else {
          el.textContent = `${mSun} ${sun.getDate()}, ${ySun} – ${mSat} ${sat.getDate()}, ${ySat}`;
        }
      } else {
        el.textContent = `${days[currentScheduleDate.getDay()]}, ${fullMonths[currentScheduleDate.getMonth()]} ${currentScheduleDate.getDate()}`;
      }
    }

    function changeSchedulePeriod(delta) {
      if (currentScheduleMode === 'month') {
        currentScheduleDate.setMonth(currentScheduleDate.getMonth() + delta);
      } else if (currentScheduleMode === 'week') {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + (delta * 7));
      } else {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + delta);
      }
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function setScheduleDateToday() {
      currentScheduleDate = new Date();
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function switchScheduleViewMode(mode) {
      currentScheduleMode = mode;
      const tabs = ['day', 'week', 'month', 'list'];
      tabs.forEach(t => {
        const btn = document.getElementById(`sched-tab-${t}`);
        if (!btn) return;
        if (t === mode) {
          btn.className = 'px-3 py-1.5 rounded-md font-semibold bg-white text-blue-600 shadow-sm border border-slate-200/60' + (t === 'list' ? ' flex items-center gap-1' : '');
        } else {
          btn.className = 'px-3 py-1.5 rounded-md font-medium text-slate-600 hover:text-slate-900 transition' + (t === 'list' ? ' flex items-center gap-1' : '');
        }
      });
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function renderScheduleView() {
      const frame = document.getElementById('schedule-calendar-frame');
      const weekGrid = document.getElementById('schedule-week-grid');
      const monthGrid = document.getElementById('schedule-month-grid');
      const dayList = document.getElementById('schedule-timeline-list');
      const listView = document.getElementById('schedule-list-view');
      if (!frame) return;

      if (currentScheduleMode === 'list') {
        frame.classList.add('hidden');
        if (listView) {
          listView.classList.remove('hidden');
          renderScheduleListView();
        }
      } else {
        frame.classList.remove('hidden');
        if (listView) listView.classList.add('hidden');

        if (currentScheduleMode === 'month') {
          if (monthGrid) monthGrid.classList.remove('hidden');
          if (weekGrid) weekGrid.classList.add('hidden');
          if (dayList) dayList.classList.add('hidden');
          renderScheduleMonthView();
        } else if (currentScheduleMode === 'week') {
          if (monthGrid) monthGrid.classList.add('hidden');
          if (weekGrid) weekGrid.classList.remove('hidden');
          if (dayList) dayList.classList.add('hidden');
          renderScheduleWeekView();
        } else {
          if (monthGrid) monthGrid.classList.add('hidden');
          if (weekGrid) weekGrid.classList.add('hidden');
          if (dayList) dayList.classList.remove('hidden');
          renderScheduleDayView();
        }
      }
    }

    const SCHED_MAX_CARDS = 3;

    function jumpScheduleDay(y, m, d) {
      // ponytail: switch to day view for target date; instant detail inspection
      currentScheduleDate = new Date(y, m, d);
      switchScheduleViewMode('day');
    }

    function renderScheduleMonthView() {
      const cellsContainer = document.getElementById('schedule-month-cells');
      if (!cellsContainer) return;

      const year = currentScheduleDate.getFullYear();
      const month = currentScheduleDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startDate = new Date(year, month, 1 - firstDay.getDay()); // back to Sunday
      const todayDate = new Date();

      let html = '';
      for (let i = 0; i < 42; i++) {
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const isCurrentMonth = current.getMonth() === month;
        const isToday = current.toDateString() === todayDate.toDateString();
        const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();

        const dateBadge = isToday
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition" title="Buka timeline ${cd}">${cd}</button>`
          : `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-xs cursor-pointer ${isCurrentMonth ? 'font-semibold text-slate-700 hover:text-blue-600' : 'font-medium text-slate-400 hover:text-slate-600'} transition" title="Buka timeline ${cd}">${cd}</button>`;

        const dayJobs = jobsForDay(current);
        const shown = dayJobs.slice(0, SCHED_MAX_CARDS);
        const cardsHtml = shown.map(e => scheduleJobCard(e.job, e.job.enabled, false, e.runs)).join('');
        const remaining = dayJobs.length - shown.length;
        const overflowHtml = remaining > 0
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer pt-1 text-left block w-full truncate transition" title="Lihat semua ${dayJobs.length} task">+${remaining} more →</button>`
          : '';

        html += `
          <div class="border-b border-r border-slate-200 p-2 min-h-[106px] flex flex-col justify-between ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-50/70 transition">
            <div class="flex justify-end mb-1">${dateBadge}</div>
            <div class="space-y-1 flex-1 min-w-0">${cardsHtml}</div>
            ${overflowHtml}
          </div>
        `;
      }

      cellsContainer.innerHTML = html;
      lucide.createIcons();
    }

    function renderScheduleDayView() {
      const container = document.getElementById('schedule-timeline-list');
      if (!container) return;

      const dayJobs = jobsForDay(currentScheduleDate);
      const dateLabel = currentScheduleDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

      if (dayJobs.length === 0) {
        container.innerHTML = `<div class="py-12 px-4 text-center text-slate-400">
            <i data-lucide="calendar-off" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-600 text-xs">No cron runs scheduled on ${dateLabel}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${liveScheduleJobs.length} job${liveScheduleJobs.length === 1 ? '' : 's'} terdaftar di Hermes — tidak ada yang jatuh pada hari ini.</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      container.innerHTML = dayJobs.map(e => {
        const job = e.job;
        const statusPill = job.enabled
          ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">ACTIVE · ON</span>'
          : '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded">PAUSED · OFF</span>';
        const agent = job.recipient_agent || job.profile || 'default';
        const lastRun = job.last_run_at ? `last: ${new Date(job.last_run_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'belum pernah jalan';
        return `
          <div class="px-5 py-3 hover:bg-slate-50/70 transition flex items-start gap-4 text-xs cursor-pointer" onclick="openEditSchedule('${job.id}')">
            <div class="font-mono font-semibold text-slate-700 w-14 text-left flex-shrink-0 pt-0.5">${e.time}</div>
            <div class="w-2 h-2 mt-1 rounded-full ${job.enabled ? (job.deliver === 'telegram' ? 'bg-blue-500 ring-2 ring-blue-100' : 'bg-emerald-500 ring-2 ring-emerald-100') : 'bg-slate-300'} flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-slate-900">${escapeHtml(job.name)}</span>
                ${statusPill}
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">${escapeHtml(agent)}</span>
              </div>
              <div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap font-mono">
                <span>${job.schedule_display || job.schedule}</span>
                ${e.runs > 1 ? `<span class="text-slate-300">•</span><span class="text-slate-600 font-semibold">${e.runs}x / hari</span>` : ''}
                <span class="text-slate-300">•</span>
                <span>→ ${job.deliver || 'local'}</span>
                <span class="text-slate-300">•</span>
                <span>${lastRun}</span>
                ${job.last_status ? `<span class="text-slate-300">•</span><span class="${job.last_status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}">${job.last_status}</span>` : ''}
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5"></i>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function renderScheduleWeekView() {
      // ponytail: show all jobs directly in week columns; vertical scroll handles high density
      const colsContainer = document.getElementById('schedule-week-cols');
      if (!colsContainer) return;

      const sun = getSundayOfWeek(currentScheduleDate);
      const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const todayDate = new Date();

      colsContainer.innerHTML = weekDays.map((dayName, idx) => {
        const d = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + idx);
        const isToday = d.toDateString() === todayDate.toDateString();
        const cy = d.getFullYear(), cm = d.getMonth(), cd = d.getDate();

        const dateHeaderBadge = isToday
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition" title="Buka timeline">${cd}</button>`
          : `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-xs font-semibold text-slate-700 hover:text-blue-600 cursor-pointer transition" title="Buka timeline">${cd}</button>`;

        const dayJobs = jobsForDay(d);
        // Tampilkan semua task tanpa dipotong agar seluruh jadwal mingguan terlihat langsung
        const cardsMarkup = dayJobs.length > 0
          ? dayJobs.map(e => scheduleJobCard(e.job, e.job.enabled, e.time, e.runs)).join('')
          : '<div class="text-[11px] text-slate-300 italic pt-4 text-center">no runs</div>';

        return `
          <div class="flex flex-col min-h-[420px] ${isToday ? 'bg-blue-50/30' : 'bg-white'}">
            <div class="px-2.5 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">${dayName}</span>
              ${dateHeaderBadge}
            </div>
            <div class="p-2 space-y-1.5 flex-1 flex flex-col justify-start overflow-y-auto max-h-[520px]">${cardsMarkup}</div>
            <div class="px-2 py-1.5 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium bg-slate-50/30">
              <button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="hover:text-blue-600 hover:underline cursor-pointer transition">
                ${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'} · timeline →
              </button>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function toggleSidebar(open) {
      const sidebar = document.getElementById('app-sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (!sidebar || !backdrop) return;
      if (open === undefined) {
        open = !sidebar.classList.contains('open');
      }
      if (open) {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    let currentDocsAgent = 'default';
    let currentDocsData = null;
    let currentDocsActiveFile = null;
    let isDocsEditing = false;
    let docsOriginalContent = '';

    async function loadDocsView() {
      const profiles = globalProfiles; // live data; empty until /api/profiles resolves

      const countEl = document.getElementById('docs-agents-count');
      if (countEl) countEl.textContent = profiles.length;

      // Render agent list in pane 1
      renderDocsAgentsList(profiles);

      // Fetch docs for currentDocsAgent
      await fetchDocsForAgent(currentDocsAgent);
    }

    function renderDocsAgentsList(profiles) {
      const agentsList = document.getElementById('docs-agents-list');
      if (!agentsList) return;

      const filterVal = (document.getElementById('docs-agent-filter')?.value || '').toLowerCase();
      const filtered = profiles.filter(p => !filterVal || p.name.toLowerCase().includes(filterVal) || p.id.toLowerCase().includes(filterVal));

      agentsList.innerHTML = filtered.map(p => {
        const isSelected = p.id === currentDocsAgent;
        const initials = getInitials(p.name || p.id);
        const avatarStyle = getAvatarColor(p.id);
        const isOnline = p.gatewayStatus === 'running';
        const model = p.model || 'ag/gemini-3.7-flash-high';

        const rowBg = isSelected ? 'bg-sky-50/80 border-sky-500 font-semibold' : 'border-transparent hover:bg-slate-50';

        return `
          <div onclick="selectDocsAgent('${p.id}')" class="p-3 flex items-center gap-3 cursor-pointer border-l-2 ${rowBg} transition select-agent-item" id="docs-agent-row-${p.id}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs flex-shrink-0" style="${avatarStyle}">
              ${initials}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1">
                <span class="text-xs font-bold text-slate-900 truncate">${p.name}</span>
                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'} flex-shrink-0"></span>
              </div>
              <div class="text-[11px] font-mono text-slate-400 truncate mt-0.5">${model}</div>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function filterDocsAgents() {
      const profiles = globalProfiles; // live data; empty until /api/profiles resolves
      renderDocsAgentsList(profiles);
    }

    async function selectDocsAgent(agentId) {
      if (isDocsEditing && docsOriginalContent) {
        const editor = document.getElementById('docs-file-editor');
        if (editor && editor.value !== docsOriginalContent) {
          if (!confirm('You have unsaved changes in the current file. Discard and switch agent?')) {
            return;
          }
        }
      }
      currentDocsAgent = agentId;
      currentDocsActiveFile = null;
      isDocsEditing = false;
      const emptyPane = document.getElementById('docs-preview-empty');
      const activePane = document.getElementById('docs-preview-active');
      if (emptyPane) emptyPane.classList.remove('hidden');
      if (activePane) activePane.classList.add('hidden');

      const profiles = globalProfiles; // live data; empty until /api/profiles resolves
      renderDocsAgentsList(profiles);
      await fetchDocsForAgent(agentId);
    }

    async function reloadCurrentAgentDocs() {
      await fetchDocsForAgent(currentDocsAgent);
    }

    async function fetchDocsForAgent(agentId) {
      const treeContainer = document.getElementById('docs-explorer-tree');
      const titleEl = document.getElementById('docs-explorer-title');
      const basePathEl = document.getElementById('docs-base-path');
      if (!treeContainer) return;

      const uppercaseName = agentId.toUpperCase();
      titleEl.textContent = `${uppercaseName} / FILES`;

      try {
        const { ok: docsOk, data } = await apiFull(`/api/agent-docs?agent=${agentId}`);
        if (docsOk) {
          currentDocsData = data;
          basePathEl.textContent = data.basePath || (agentId === 'default' ? '~/.hermes' : `~/.hermes/profiles/${agentId}`);
          renderDocsTree(data.docs);
        } else {
          treeContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">Failed to load files</div>`;
        }
      } catch (e) {
        treeContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">Error reading file directory</div>`;
      }
    }

    function renderDocsTree(docs) {
      const container = document.getElementById('docs-explorer-tree');
      if (!container || !docs) return;

      const folders = docs.folders || {};
      const rootFiles = docs.rootFiles || [];
      const workspaces = docs.taskWorkspaces || [];

      let html = '';

      // Section 1: PROFILE DOCS
      html += `
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">PROFILE DOCS</div>
          <div class="space-y-1">
      `;

      // Folder accordions
      for (const [folderName, files] of Object.entries(folders)) {
        html += `
          <details class="group select-none" open>
            <summary class="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 font-medium">
              <span class="text-[9px] text-slate-400 transition-transform group-open:rotate-90">▶</span>
              <i data-lucide="folder" class="w-3.5 h-3.5 text-amber-500 fill-amber-100"></i>
              <span>${folderName}</span>
              <span class="text-[10px] text-slate-400 ml-auto font-mono">${files.length}</span>
            </summary>
            <div class="pl-5 space-y-0.5 mt-0.5 border-l border-slate-100 ml-2.5">
              ${files.map(f => {
                const isSelected = currentDocsActiveFile && currentDocsActiveFile.relPath === f.relPath;
                const itemClass = isSelected ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
                const iconColor = isSelected ? 'text-blue-600' : 'text-slate-400 group-hover/file:text-slate-600';
                return `
                  <div data-doc-path="${f.relPath}" onclick="selectDocsFile('${f.relPath}', '${f.name}')" class="docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition ${itemClass} group/file">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
                    <span class="truncate font-mono text-[11.5px]">${f.name}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        `;
      }

      // Root files
      rootFiles.forEach(f => {
        const isSelected = currentDocsActiveFile && currentDocsActiveFile.relPath === f.relPath;
        const itemClass = isSelected ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100';
        const iconColor = isSelected ? 'text-blue-600' : 'text-slate-400 group-hover/file:text-slate-600';
        const iconName = f.name.endsWith('.md') ? 'file-text' : (f.name.endsWith('.yaml') || f.name.endsWith('.json') ? 'file-code' : 'file');
        html += `
          <div data-doc-path="${f.relPath}" onclick="selectDocsFile('${f.relPath}', '${f.name}')" class="docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition ${itemClass} group/file">
            <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
            <span class="truncate font-mono text-[11.5px]">${f.name}</span>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;

      // Section 2: TASK WORKSPACES
      html += `
        <div class="pt-2 border-t border-slate-100">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">TASK WORKSPACES</div>
          ${workspaces.length > 0 ? `
            <div class="space-y-1">
              ${workspaces.map(ws => `
                <div class="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 font-mono text-[11.5px]">
                  <i data-lucide="folder-git-2" class="w-3.5 h-3.5 text-indigo-500"></i>
                  <span class="truncate">${ws}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="text-[11px] text-slate-400 italic px-1">No task workspaces for this agent yet.</div>
          `}
        </div>
      `;

      container.innerHTML = html;
      lucide.createIcons();
    }

    function updateDocsTreeActiveState(activeRelPath) {
      document.querySelectorAll('.docs-file-item').forEach(el => {
        const isThis = el.getAttribute('data-doc-path') === activeRelPath;
        const icon = el.querySelector('i, svg');
        if (isThis) {
          el.className = 'docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs group/file';
          if (icon) {
            icon.classList.remove('text-slate-400');
            icon.classList.add('text-blue-600');
          }
        } else {
          el.className = 'docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition text-slate-600 hover:text-slate-900 hover:bg-slate-100 group/file';
          if (icon) {
            icon.classList.remove('text-blue-600');
            icon.classList.add('text-slate-400');
          }
        }
      });
    }

    async function selectDocsFile(relPath, fileName) {
      const editor = document.getElementById('docs-file-editor');
      if (isDocsEditing && editor && editor.value !== docsOriginalContent) {
        if (!confirm('You have unsaved changes in the current file. Discard and switch file?')) {
          return;
        }
      }

      currentDocsActiveFile = { relPath, fileName };
      updateDocsTreeActiveState(relPath);

      const emptyPane = document.getElementById('docs-preview-empty');
      const activePane = document.getElementById('docs-preview-active');
      const nameEl = document.getElementById('docs-file-name');
      const pathEl = document.getElementById('docs-file-path');
      const metaEl = document.getElementById('docs-file-meta');
      const contentEl = document.getElementById('docs-file-content');
      const badge = document.getElementById('docs-file-status-badge');

      nameEl.textContent = fileName;
      pathEl.textContent = `${currentDocsAgent}/${relPath}`;
      metaEl.textContent = 'Loading...';
      contentEl.textContent = 'Loading content...';
      if (badge) badge.classList.add('hidden');

      emptyPane.classList.add('hidden');
      activePane.classList.remove('hidden');

      setupDocsEditorListeners();

      try {
        const { ok: docOk, data: d } = await apiFull(`/api/agent-doc-content?agent=${currentDocsAgent}&path=${encodeURIComponent(relPath)}`);
        if (docOk) {
          const kb = (d.size / 1024).toFixed(1);
          metaEl.textContent = `${kb} KB`;
          docsOriginalContent = d.content || '';
          contentEl.textContent = d.content || '(Empty file)';
          if (editor) editor.value = docsOriginalContent;
          updateEditorCharCount();
        } else {
          metaEl.textContent = 'Error';
          contentEl.textContent = 'Could not load file content.';
          docsOriginalContent = '';
        }
      } catch (e) {
        metaEl.textContent = 'Error';
        contentEl.textContent = 'Failed to fetch file content.';
        docsOriginalContent = '';
      }

      toggleDocsEditMode(false);
      lucide.createIcons();
    }

    function toggleDocsEditMode(forceMode) {
      if (!currentDocsActiveFile) return;
      const viewEl = document.getElementById('docs-file-content');
      const editorContainer = document.getElementById('docs-file-editor-container');
      const editor = document.getElementById('docs-file-editor');
      const editBtnText = document.getElementById('docs-edit-btn-text');
      const editBtnIcon = document.getElementById('docs-edit-btn-icon');
      const saveBtn = document.getElementById('docs-save-btn');
      const badge = document.getElementById('docs-file-status-badge');

      isDocsEditing = (forceMode !== undefined) ? forceMode : !isDocsEditing;

      if (isDocsEditing) {
        viewEl.classList.add('hidden');
        editorContainer.classList.remove('hidden');
        if (editor) {
          editor.value = docsOriginalContent;
          editor.focus();
        }
        if (editBtnText) editBtnText.textContent = 'Preview';
        if (editBtnIcon) editBtnIcon.setAttribute('data-lucide', 'eye');
        if (saveBtn) saveBtn.classList.remove('hidden');
        updateEditorCharCount();
      } else {
        viewEl.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        if (editBtnText) editBtnText.textContent = 'Edit';
        if (editBtnIcon) editBtnIcon.setAttribute('data-lucide', 'edit-3');
        if (editor && editor.value === docsOriginalContent) {
          if (saveBtn) saveBtn.classList.add('hidden');
          if (badge) badge.classList.add('hidden');
        }
      }
      lucide.createIcons();
    }

    function updateEditorCharCount() {
      const editor = document.getElementById('docs-file-editor');
      const countEl = document.getElementById('docs-editor-cursor-pos');
      if (!editor || !countEl) return;
      const val = editor.value || '';
      const lines = val ? val.split('\n').length : 0;
      countEl.textContent = `${lines} lines · ${val.length} chars`;

      const badge = document.getElementById('docs-file-status-badge');
      const isDirty = (val !== docsOriginalContent);
      if (badge) {
        if (isDirty) {
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }

    async function saveDocsFileContent() {
      if (!currentDocsActiveFile) return;
      const editor = document.getElementById('docs-file-editor');
      const saveBtn = document.getElementById('docs-save-btn');
      const metaEl = document.getElementById('docs-file-meta');
      const viewEl = document.getElementById('docs-file-content');
      const badge = document.getElementById('docs-file-status-badge');
      if (!editor || !saveBtn) return;

      const newContent = editor.value;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i><span>Saving...</span>';
      lucide.createIcons();

      try {
        const { ok: docSaveOk, data } = await apiFull('/api/agent-doc-content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentDocsAgent,
            path: currentDocsActiveFile.relPath,
            content: newContent
          })
        });

        if (docSaveOk && data.success) {
          docsOriginalContent = newContent;
          if (viewEl) viewEl.textContent = newContent || '(Empty file)';
          if (metaEl && data.size !== undefined) {
            metaEl.textContent = `${(data.size / 1024).toFixed(1)} KB`;
          }
          if (badge) badge.classList.add('hidden');
          saveBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i><span>Saved</span>';
          saveBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
          saveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
          lucide.createIcons();
          setTimeout(() => {
            saveBtn.innerHTML = '<i data-lucide="save" class="w-3 h-3"></i><span>Save</span>';
            saveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            saveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            if (!isDocsEditing) saveBtn.classList.add('hidden');
            lucide.createIcons();
          }, 1500);
        } else {
          throw new Error(data.error || 'Failed to save file');
        }
      } catch (err) {
        alert('Failed to save file: ' + err.message);
        saveBtn.innerHTML = '<i data-lucide="save" class="w-3 h-3"></i><span>Save</span>';
        lucide.createIcons();
      } finally {
        saveBtn.disabled = false;
      }
    }

    function setupDocsEditorListeners() {
      const editor = document.getElementById('docs-file-editor');
      if (!editor || editor.__docsListenersReady) return;
      editor.__docsListenersReady = true;

      editor.addEventListener('input', updateEditorCharCount);
      editor.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = this.selectionStart;
          const end = this.selectionEnd;
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
          updateEditorCharCount();
        }
      });

      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          const ed = document.getElementById('docs-file-editor');
          if (ed && !ed.closest('.hidden')) {
            e.preventDefault();
            saveDocsFileContent();
          }
        }
      });
    }

    function copyDocsFileContent() {
      const content = isDocsEditing
        ? document.getElementById('docs-file-editor')?.value
        : document.getElementById('docs-file-content')?.textContent;
      if (content) {
        navigator.clipboard.writeText(content);
        alert('File content copied to clipboard');
      }
    }

    function copyDocsBasePath() {
      const p = document.getElementById('docs-base-path')?.textContent;
      if (p) {
        navigator.clipboard.writeText(p);
        alert('Copied path: ' + p);
      }
    }

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

    // ================= CHAT LOGS & TRANSCRIPTS JS =================
    let currentChatLogsProfile = 'all';
    let currentChatLogsType = 'chat'; // 'chat' | 'cron' | 'all'
    let chatLogsSessionsData = [];
    let currentSelectedSessionId = null;
    let currentSelectedSessionProfile = null;
    let showChatLogsTools = true;
    let chatLogsSearchQuery = '';

    // (chat badges now resolved via chatBadgeFor() — no hardcoded team.)

    function formatTimeAgo(ts) {
      if (!ts) return 'recently';
      const now = Date.now() / 1000;
      const diff = Math.max(0, now - ts);
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    }

    function formatTokens(num) {
      if (!num) return '0 tok';
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M tok`;
      if (num >= 1000) return `${Math.round(num / 1000)}k tok`;
      return `${num} tok`;
    }

    function updateChatLogsMetrics() {
      const profileSessions = chatLogsSessionsData.filter(s => currentChatLogsProfile === 'all' || s.profile === currentChatLogsProfile);
      const total = profileSessions.length;
      const chatsCount = profileSessions.filter(s => !s.isCron).length;
      const cronCount = profileSessions.filter(s => s.isCron).length;
      const active = profileSessions.filter(s => s.isActive).length;

      const elTotal = document.getElementById('chat-logs-metric-total');
      const elChats = document.getElementById('chat-logs-metric-chats');
      const elCron = document.getElementById('chat-logs-metric-cron');
      const elActive = document.getElementById('chat-logs-metric-active');

      if (elTotal) elTotal.textContent = total;
      if (elChats) elChats.textContent = chatsCount;
      if (elCron) elCron.textContent = cronCount;
      if (elActive) elActive.textContent = active;

      const tabBadgeChat = document.getElementById('chat-logs-tab-badge-chat');
      const tabBadgeCron = document.getElementById('chat-logs-tab-badge-cron');
      const tabBadgeAll = document.getElementById('chat-logs-tab-badge-all');

      if (tabBadgeChat) tabBadgeChat.textContent = chatsCount;
      if (tabBadgeCron) tabBadgeCron.textContent = cronCount;
      if (tabBadgeAll) tabBadgeAll.textContent = total;
    }

    function getFilteredChatLogsSessions() {
      return chatLogsSessionsData.filter(s => {
        const matchProf = currentChatLogsProfile === 'all' || s.profile === currentChatLogsProfile;
        let matchType = true;
        if (currentChatLogsType === 'chat') matchType = !s.isCron;
        else if (currentChatLogsType === 'cron') matchType = s.isCron;

        const matchQuery = !chatLogsSearchQuery || 
          (s.title && s.title.toLowerCase().includes(chatLogsSearchQuery)) || 
          (s.id && s.id.toLowerCase().includes(chatLogsSearchQuery)) ||
          (s.model && s.model.toLowerCase().includes(chatLogsSearchQuery));
        return matchProf && matchType && matchQuery;
      });
    }

    async function loadChatLogsView() {
      const btn = document.getElementById('btn-refresh-chat-logs');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Refreshing...</span>';
        lucide.createIcons();
      }

      try {
        const data = await api(`/api/chat-logs/sessions?limit=500`, {}, 'Gagal memuat chat logs');
        {
          chatLogsSessionsData = data.sessions || [];

          renderChatProfilePills();
          updateChatLogsMetrics();
          renderChatLogsSessionList();

          const filtered = getFilteredChatLogsSessions();
          if (currentSelectedSessionId && filtered.some(s => s.id === currentSelectedSessionId)) {
            selectChatLogSession(currentSelectedSessionId, currentSelectedSessionProfile);
          } else if (filtered.length > 0) {
            selectChatLogSession(filtered[0].id, filtered[0].profile);
          } else {
            currentSelectedSessionId = null;
            currentSelectedSessionProfile = null;
            const emptyPane = document.getElementById('chat-logs-detail-empty');
            const activePane = document.getElementById('chat-logs-detail-active');
            if (emptyPane) emptyPane.classList.remove('hidden');
            if (activePane) activePane.classList.add('hidden');
          }
        }
      } catch (e) {
        console.error('Error loading chat logs:', e);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="rotate-cw" class="w-3.5 h-3.5" id="refresh-chat-logs-icon"></i><span>Refresh Logs</span>';
          lucide.createIcons();
        }
      }
    }

    function setChatLogsTypeFilter(type, btn) {
      currentChatLogsType = type;
      document.querySelectorAll('.chat-logs-type-pill').forEach(el => {
        el.className = 'chat-logs-type-pill py-1.5 px-2 rounded-md text-center transition font-medium text-slate-600 hover:text-slate-900 cursor-pointer flex items-center justify-center gap-1';
      });
      if (btn) {
        btn.className = 'chat-logs-type-pill py-1.5 px-2 rounded-md text-center transition font-semibold bg-white text-slate-900 shadow-2xs cursor-pointer flex items-center justify-center gap-1';
      }
      const labelEl = document.getElementById('chat-logs-type-label');
      if (labelEl) {
        if (type === 'chat') labelEl.textContent = 'Chat Sessions';
        else if (type === 'cron') labelEl.textContent = 'Cronjob Outputs';
        else labelEl.textContent = 'All Sessions';
      }
      const pruneLabel = document.getElementById('chat-logs-prune-label');
      if (pruneLabel) {
        if (type === 'chat') pruneLabel.textContent = 'Clear Inactive Chats';
        else if (type === 'cron') pruneLabel.textContent = 'Clear Inactive Cron';
        else pruneLabel.textContent = 'Clear All Inactive';
      }

      renderChatLogsSessionList();

      const filtered = getFilteredChatLogsSessions();
      if (filtered.length > 0) {
        const isCurrentStillVisible = filtered.some(s => s.id === currentSelectedSessionId);
        if (!isCurrentStillVisible) {
          selectChatLogSession(filtered[0].id, filtered[0].profile);
        }
      } else {
        currentSelectedSessionId = null;
        currentSelectedSessionProfile = null;
        const emptyPane = document.getElementById('chat-logs-detail-empty');
        const activePane = document.getElementById('chat-logs-detail-active');
        if (emptyPane) emptyPane.classList.remove('hidden');
        if (activePane) activePane.classList.add('hidden');
      }
    }

    // Profile pills follow live profiles + sessions, not a hardcoded team.
    function renderChatProfilePills() {
      const c = document.getElementById('chat-logs-profile-pills');
      if (!c) return;
      const ids = ['all', ...new Set([
        ...globalProfiles.map(p => p.id),
        ...(chatLogsSessionsData || []).map(x => x.profile).filter(Boolean),
      ])];
      c.innerHTML = ids.map(id => {
        const active = currentChatLogsProfile === id;
        const label = id === 'all' ? 'All Agents' : profileNameFor(id);
        return `<button onclick="setChatLogsProfileFilter('${id}', this)" class="chat-logs-pill px-3 py-1 rounded-full font-medium ${active ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} cursor-pointer">${escapeHtml(label)}</button>`;
      }).join('');
    }

    function setChatLogsProfileFilter(profile, btn) {
      currentChatLogsProfile = profile;
      document.querySelectorAll('.chat-logs-pill').forEach(el => {
        el.className = 'chat-logs-pill px-3 py-1 rounded-full font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer';
      });
      if (btn) {
        btn.className = 'chat-logs-pill px-3 py-1 rounded-full font-medium bg-slate-900 text-white shadow-xs cursor-pointer';
      }
      updateChatLogsMetrics();
      renderChatLogsSessionList();

      const filtered = getFilteredChatLogsSessions();
      if (filtered.length > 0) {
        const isCurrentStillVisible = filtered.some(s => s.id === currentSelectedSessionId);
        if (!isCurrentStillVisible) {
          selectChatLogSession(filtered[0].id, filtered[0].profile);
        }
      } else {
        currentSelectedSessionId = null;
        currentSelectedSessionProfile = null;
        const emptyPane = document.getElementById('chat-logs-detail-empty');
        const activePane = document.getElementById('chat-logs-detail-active');
        if (emptyPane) emptyPane.classList.remove('hidden');
        if (activePane) activePane.classList.add('hidden');
      }
    }

    function handleChatLogsSearch(val) {
      chatLogsSearchQuery = (val || '').toLowerCase().trim();
      renderChatLogsSessionList();
    }

    function renderChatLogsSessionList() {
      const container = document.getElementById('chat-logs-session-list');
      const countEl = document.getElementById('chat-logs-filtered-count');
      if (!container) return;

      const filtered = getFilteredChatLogsSessions();

      if (countEl) countEl.textContent = filtered.length;

      if (filtered.length === 0) {
        const typeEmptyName = currentChatLogsType === 'chat' ? 'sesi chat' : (currentChatLogsType === 'cron' ? 'output cronjob' : 'sesi');
        container.innerHTML = `
          <div class="py-12 px-4 text-center text-slate-400">
            <i data-lucide="message-square-off" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-600">Tidak ada ${typeEmptyName} ditemukan</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Coba ganti kategori filter atau kata kunci pencarian.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      container.innerHTML = filtered.map(s => {
        const isSelected = s.id === currentSelectedSessionId;
        const profInfo = chatBadgeFor(s.profile);
        const activeBg = isSelected ? 'bg-indigo-50/90 border-l-4 border-indigo-600 pl-2.5' : 'hover:bg-slate-50/80';
        const pulse = s.isActive ? '<span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 ring-2 ring-emerald-200 animate-pulse"></span>' : '<span class="w-2 h-2 rounded-full shrink-0 bg-slate-300"></span>';
        const dateStr = s.lastActivityAt ? formatTimeAgo(s.lastActivityAt) : '-';
        const tokStr = s.tokens > 1000 ? `${Math.round(s.tokens/1000)}k tok` : `${s.tokens} tok`;
        const deleteItemBtn = !s.isActive ? `
          <button onclick="event.stopPropagation(); deleteSessionItem('${s.id}', '${s.profile}')" title="Hapus sesi ini" class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition cursor-pointer">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        ` : '';

        const sourceBadge = s.isCron
          ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-0.5"><i data-lucide="clock" class="w-2.5 h-2.5"></i>CRON</span>`
          : `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${s.source === 'telegram' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-600 border-slate-200'}">${escapeHtml(s.source || 'chat')}</span>`;

        return `
          <div class="p-3 cursor-pointer transition-colors group relative ${activeBg}" onclick="selectChatLogSession('${s.id}', '${s.profile}')">
            <div class="flex items-center justify-between gap-2 mb-1">
              <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                ${pulse}
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold uppercase border ${profInfo.badge}">${profInfo.name}</span>
                ${sourceBadge}
                <span class="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">${escapeHtml(s.model)}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span class="text-[10.5px] text-slate-400">${dateStr}</span>
                ${deleteItemBtn}
              </div>
            </div>
            <div class="font-semibold text-slate-900 truncate mb-1 text-xs pr-2" title="${escapeHtml(s.title)}">
              ${escapeHtml(s.title)}
            </div>
            <div class="flex items-center justify-between text-[10.5px] text-slate-400 font-mono">
              <span>${s.messageCount} msgs · ${tokStr}</span>
              <span class="truncate max-w-[100px] text-slate-400 text-[10px]">${s.id.substring(0, 16)}</span>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    async function selectChatLogSession(sessionId, profileHint) {
      currentSelectedSessionId = sessionId;
      currentSelectedSessionProfile = profileHint;
      renderChatLogsSessionList();

      const emptyPane = document.getElementById('chat-logs-detail-empty');
      const activePane = document.getElementById('chat-logs-detail-active');
      const streamEl = document.getElementById('chat-logs-message-stream');

      if (emptyPane) emptyPane.classList.add('hidden');
      if (activePane) activePane.classList.remove('hidden');

      if (streamEl) {
        streamEl.innerHTML = `
          <div class="py-16 text-center text-slate-400">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500"></i>
            <p class="font-medium text-slate-600">Mengambil histori transkrip...</p>
          </div>
        `;
        lucide.createIcons();
      }

      try {
        const url = `/api/chat-logs/sessions/${sessionId}${profileHint ? '?profile=' + profileHint : ''}`;
        const data = await api(url, {}, 'Session messages not found');
        renderChatLogMessages(data.session, data.messages);
      } catch (err) {
        if (streamEl) {
          streamEl.innerHTML = `
            <div class="py-12 text-center text-red-500">
              <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2"></i>
              <p class="font-medium">Gagal memuat transkrip</p>
              <p class="text-xs text-slate-500 mt-1">${err.message}</p>
            </div>
          `;
          lucide.createIcons();
        }
      }
    }

    function renderChatLogMessages(session, messages) {
      // Update top bar
      const titleEl = document.getElementById('chat-logs-active-title');
      const badgeEl = document.getElementById('chat-logs-active-profile-badge');
      const modelEl = document.getElementById('chat-logs-active-model');
      const idEl = document.getElementById('chat-logs-active-id');
      const metaEl = document.getElementById('chat-logs-active-meta');
      const timeEl = document.getElementById('chat-logs-active-time');
      const pulseEl = document.getElementById('chat-logs-active-pulse');

      if (titleEl) titleEl.textContent = session.title || 'Untitled Session';
      if (modelEl) modelEl.textContent = session.model || 'default';
      if (idEl) idEl.textContent = session.id;

      const profInfo = chatBadgeFor(session.profile);
      if (badgeEl) {
        badgeEl.textContent = profInfo.name;
        badgeEl.className = `px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${profInfo.badge}`;
      }

      const typeBadgeEl = document.getElementById('chat-logs-active-type-badge');
      if (typeBadgeEl) {
        if (session.isCron) {
          typeBadgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1';
          typeBadgeEl.innerHTML = '<i data-lucide="clock" class="w-3 h-3"></i><span>CRONJOB</span>';
        } else {
          typeBadgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1';
          typeBadgeEl.innerHTML = `<i data-lucide="message-square" class="w-3 h-3"></i><span>${escapeHtml((session.source || 'CHAT').toUpperCase())}</span>`;
        }
      }

      const tokStr = session.tokens > 1000 ? `${Math.round(session.tokens/1000)}k tok` : `${session.tokens} tok`;
      if (metaEl) metaEl.textContent = `${session.messageCount || messages.length} msgs · ${tokStr}`;
      if (timeEl) timeEl.textContent = session.lastActivityAt ? new Date(session.lastActivityAt * 1000).toLocaleString('id-ID') : '-';
      if (pulseEl) {
        pulseEl.className = session.isActive ? 'w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500 ring-2 ring-emerald-200 animate-pulse' : 'w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300';
      }

      const delBtn = document.getElementById('chat-logs-btn-delete-session');
      if (delBtn) {
        if (!session.isActive) {
          delBtn.classList.remove('hidden');
        } else {
          delBtn.classList.add('hidden');
        }
      }

      const streamEl = document.getElementById('chat-logs-message-stream');
      if (!streamEl) return;

      if (!messages || messages.length === 0) {
        streamEl.innerHTML = `
          <div class="py-12 text-center text-slate-400">
            <p class="font-medium text-slate-600">Sesi ini belum memiliki rekaman pesan.</p>
          </div>
        `;
        return;
      }

      function formatChatLogContent(raw) {
        if (!raw) return '';
        let escaped = escapeHtml(raw);
        // code blocks
        escaped = escaped.replace(/```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
          return `<pre class="my-2 p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800"><code>${code.trim()}</code></pre>`;
        });
        // inline code
        escaped = escaped.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-200/80 text-slate-800 font-mono text-[11px]">$1</code>');
        // bold
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // newline to br
        escaped = escaped.replace(/\n/g, '<br/>');
        return escaped;
      }

      let html = '';
      messages.forEach((m) => {
        const timeStr = m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

        if (m.role === 'user') {
          const isCronPrompt = session.isCron || (m.content && m.content.includes('scheduled cron job'));
          const headerRoleTitle = isCronPrompt ? 'Cron Scheduler Trigger' : 'Operator / User';
          const avatarBg = isCronPrompt ? 'bg-amber-500' : 'bg-slate-800';
          const avatarIcon = isCronPrompt ? '<i data-lucide="clock" class="w-3.5 h-3.5"></i>' : 'U';
          const bubbleBg = isCronPrompt ? 'bg-amber-50/40 border border-amber-200/70' : 'bg-white border border-slate-200/80';

          html += `
            <div class="flex gap-2.5 items-start max-w-3xl">
              <div class="w-7 h-7 rounded-lg ${avatarBg} text-white flex items-center justify-center shrink-0 shadow-xs text-[11px] font-bold">
                ${avatarIcon}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-bold ${isCronPrompt ? 'text-amber-900' : 'text-slate-900'}">${headerRoleTitle}</span>
                  <span class="text-[10px] text-slate-400 font-mono">${timeStr}</span>
                </div>
                <div class="${bubbleBg} rounded-2xl rounded-tl-sm p-3 shadow-xs text-slate-800 leading-relaxed text-xs">
                  ${formatChatLogContent(m.content)}
                </div>
              </div>
            </div>
          `;
        } else if (m.role === 'assistant') {
          let toolCallMarkup = '';
          if (showChatLogsTools && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            toolCallMarkup = m.tool_calls.map(tc => {
              const fnName = tc.function?.name || tc.name || 'tool_call';
              let fnArgs = tc.function?.arguments || tc.arguments || '';
              if (typeof fnArgs === 'object') fnArgs = JSON.stringify(fnArgs, null, 2);
              return `
                <div class="chat-log-tool-item my-1.5 bg-amber-50/70 border border-amber-200/70 rounded-lg p-2 font-mono text-[11px] text-amber-900">
                  <div class="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                    <i data-lucide="wrench" class="w-3 h-3 text-amber-600"></i>
                    <span>Call: ${escapeHtml(fnName)}</span>
                  </div>
                  <div class="text-[10px] text-amber-800/80 max-h-24 overflow-y-auto whitespace-pre-wrap">${escapeHtml(fnArgs)}</div>
                </div>
              `;
            }).join('');
          }

          let reasoningMarkup = '';
          if (m.reasoning_content) {
            reasoningMarkup = `
              <details class="my-2 bg-purple-50/50 border border-purple-200/60 rounded-lg p-2 text-[11px] text-purple-900">
                <summary class="font-semibold text-purple-800 cursor-pointer flex items-center gap-1.5 select-none">
                  <i data-lucide="brain" class="w-3 h-3 text-purple-600"></i>
                  <span>Reasoning &amp; Thoughts</span>
                </summary>
                <div class="mt-2 pl-2 border-l-2 border-purple-300 text-purple-950 whitespace-pre-wrap leading-relaxed text-[11px]">
                  ${escapeHtml(m.reasoning_content)}
                </div>
              </details>
            `;
          }

          if (!m.content && !toolCallMarkup && !reasoningMarkup) return;

          html += `
            <div class="flex gap-2.5 items-start max-w-3xl ml-auto flex-row-reverse">
              <div class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs text-[11px] font-bold">
                <i data-lucide="bot" class="w-4 h-4"></i>
              </div>
              <div class="flex-1 min-w-0 text-right">
                <div class="flex items-center justify-end gap-2 mb-1">
                  <span class="text-[10px] text-slate-400 font-mono">${timeStr}</span>
                  <span class="font-bold text-indigo-700">${escapeHtml(profInfo.name)}</span>
                </div>
                <div class="bg-indigo-50/50 border border-indigo-100 rounded-2xl rounded-tr-sm p-3 shadow-xs text-slate-800 text-left leading-relaxed text-xs">
                  ${reasoningMarkup}
                  ${toolCallMarkup}
                  ${m.content ? `<div>${formatChatLogContent(m.content)}</div>` : ''}
                </div>
              </div>
            </div>
          `;
        } else if (m.role === 'tool') {
          if (!showChatLogsTools) return;
          html += `
            <div class="chat-log-tool-msg my-2 max-w-3xl mx-auto w-full">
              <details class="bg-slate-100/90 border border-slate-200 rounded-lg overflow-hidden text-[11px] group">
                <summary class="px-3 py-1.5 bg-slate-200/60 flex items-center justify-between cursor-pointer font-mono font-semibold text-slate-700 select-none">
                  <div class="flex items-center gap-1.5">
                    <i data-lucide="terminal" class="w-3.5 h-3.5 text-slate-500"></i>
                    <span>Tool Output: <strong class="text-indigo-600">${escapeHtml(m.tool_name || 'tool')}</strong></span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-normal">Click to toggle</span>
                </summary>
                <div class="p-2.5 max-h-56 overflow-y-auto font-mono text-[10.5px] bg-slate-900 text-slate-200 whitespace-pre-wrap leading-relaxed">
${escapeHtml(m.content || '(No output returned)')}
                </div>
              </details>
            </div>
          `;
        }
      });

      streamEl.innerHTML = html;
      lucide.createIcons();
    }

    function toggleChatLogsTools(checked) {
      showChatLogsTools = checked;
      renderChatLogMessages();
    }

    function reloadCurrentSessionMessages() {
      if (currentSelectedSessionId) {
        selectChatLogSession(currentSelectedSessionId, currentSelectedSessionProfile);
      }
    }

    function copyActiveSessionId() {
      if (currentSelectedSessionId) {
        navigator.clipboard.writeText(currentSelectedSessionId);
        alert('Copied Session ID: ' + currentSelectedSessionId);
      }
    }

    function openChatLogSessionFromDashboard(sessionId, profile) {
      const isCron = sessionId && (sessionId.startsWith('cron_') || sessionId.includes('cron'));
      currentChatLogsType = isCron ? 'cron' : 'chat';
      document.querySelectorAll('.chat-logs-type-pill').forEach(el => {
        el.className = 'chat-logs-type-pill py-1.5 px-2 rounded-md text-center transition font-medium text-slate-600 hover:text-slate-900 cursor-pointer flex items-center justify-center gap-1';
      });
      const activeTabBtn = document.getElementById(`chat-logs-tab-${currentChatLogsType}`);
      if (activeTabBtn) {
        activeTabBtn.className = 'chat-logs-type-pill py-1.5 px-2 rounded-md text-center transition font-semibold bg-white text-slate-900 shadow-2xs cursor-pointer flex items-center justify-center gap-1';
      }
      const labelEl = document.getElementById('chat-logs-type-label');
      if (labelEl) {
        labelEl.textContent = isCron ? 'Cronjob Outputs' : 'Chat Sessions';
      }
      switchNavByName('Chat Logs');
      selectChatLogSession(sessionId, profile);
    }

    async function deleteCurrentSession() {
      if (!currentSelectedSessionId) return;
      await deleteSessionItem(currentSelectedSessionId, currentSelectedSessionProfile);
    }

    async function deleteSessionItem(sessionId, profile) {
      if (!confirm(`Hapus sesi "${sessionId}" secara permanen?`)) return;

      try {
        const url = `/api/chat-logs/sessions/${sessionId}${profile ? '?profile=' + profile : ''}`;
        const { ok: sessDelOk, data } = await apiFull(url, { method: 'DELETE' });
        if (!sessDelOk || !data.success) {
          alert('Gagal menghapus sesi: ' + (data.error || 'Unknown error'));
          return;
        }

        chatLogsSessionsData = chatLogsSessionsData.filter(s => s.id !== sessionId);

        if (currentSelectedSessionId === sessionId) {
          currentSelectedSessionId = null;
          currentSelectedSessionProfile = null;
          const activePane = document.getElementById('chat-logs-detail-active');
          const emptyPane = document.getElementById('chat-logs-detail-empty');
          if (activePane) activePane.classList.add('hidden');
          if (emptyPane) emptyPane.classList.remove('hidden');
        }

        updateChatLogsMetrics();
        renderChatLogsSessionList();

        const filtered = getFilteredChatLogsSessions();
        if (!currentSelectedSessionId && filtered.length > 0) {
          selectChatLogSession(filtered[0].id, filtered[0].profile);
        }
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      }
    }

    async function confirmPruneInactiveSessions() {
      const scopeProfile = currentChatLogsProfile === 'all' ? 'seluruh agent' : `agent ${currentChatLogsProfile}`;
      let scopeType = 'seluruh sesi';
      if (currentChatLogsType === 'chat') scopeType = 'riwayat CHAT saja';
      else if (currentChatLogsType === 'cron') scopeType = 'riwayat CRONJOB saja';

      if (!confirm(`Bersihkan ${scopeType} yang tidak aktif untuk ${scopeProfile}? Sesi aktif tidak akan terpengaruh.`)) return;

      const btn = document.getElementById('btn-prune-inactive-chat-logs');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-rose-600"></i><span>Clearing...</span>';
        lucide.createIcons();
      }

      try {
        const { ok: pruneOk, data } = await apiFull('/api/chat-logs/sessions/prune-inactive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: currentChatLogsProfile, type: currentChatLogsType })
        });
        if (!pruneOk || !data.success) {
          alert('Gagal membersihkan sesi: ' + (data.error || 'Unknown error'));
          return;
        }

        alert(data.message || 'Sesi tidak aktif berhasil dibersihkan.');
        currentSelectedSessionId = null;
        currentSelectedSessionProfile = null;
        loadChatLogsView();
      } catch (err) {
        alert('Kesalahan jaringan: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          const pruneLabel = document.getElementById('chat-logs-prune-label');
          const lbl = pruneLabel ? pruneLabel.textContent : 'Clear Inactive';
          btn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5 text-rose-600"></i><span id="chat-logs-prune-label">${lbl}</span>`;
          lucide.createIcons();
        }
      }
    }

    async function runReadyKanbanTasks() {
      const button = document.getElementById('run-ready-tasks-btn');
      if (button) button.disabled = true;
      try {
        const { ok, data } = await apiFull('/api/kanban/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (!ok || !data.success) throw new Error(data.error || 'Dispatch failed');
        alert('Ready tasks dispatched.');
        await fetchLiveMetrics();
      } catch (err) {
        alert('Dispatch failed: ' + err.message);
      } finally {
        if (button) button.disabled = false;
      }
    }

    function openNewKanbanTask() {
      switchNav(null, 'New task');
      document.getElementById('new-task-title')?.focus();
    }

    function closeNewKanbanTask() {
      switchNavByName('Kanban');
    }

    async function submitNewKanbanTask(event) {
      event.preventDefault();
      const submit = document.getElementById('new-task-submit-btn');
      const error = document.getElementById('new-task-form-error');
      const payload = {
        title: document.getElementById('new-task-title').value.trim(),
        body: document.getElementById('new-task-body').value.trim(),
        assignee: document.getElementById('new-task-assignee').value,
        status: 'ready',
        priority: Number(document.getElementById('new-task-priority').value)
      };
      if (!payload.title) return;
      submit.disabled = true;
      error.classList.add('hidden');
      try {
        const { ok, data } = await apiFull('/api/kanban/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!ok || !data.success) throw new Error(data.error || 'Task creation failed');
        document.getElementById('new-kanban-task-form').reset();
        await fetchLiveMetrics();
        switchNavByName('Kanban');
      } catch (err) {
        error.textContent = err.message;
        error.classList.remove('hidden');
      } finally {
        submit.disabled = false;
      }
    }

    // ================= MODELS VIEW LOGIC =================
    let globalModelsOverview = null;
    let currentModelsFilter = 'all';
    let modelsSearchQuery = '';

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function loadModelsView() {
      try {
        const data = await api('/api/models/overview', {}, 'Gagal memuat ringkasan model');
        globalModelsOverview = data;

        if (data.stats) {
          const totalEl = document.getElementById('models-metric-total');
          const setEl = document.getElementById('models-metric-set');
          const unsetEl = document.getElementById('models-metric-unset');
          const setDescEl = document.getElementById('models-metric-set-desc');
          const pillAll = document.getElementById('pill-count-all');
          const pillSet = document.getElementById('pill-count-set');
          const pillUnset = document.getElementById('pill-count-unset');
          const assignedCount = document.getElementById('models-assigned-count');

          if (totalEl) totalEl.textContent = data.stats.total || 0;
          if (setEl) setEl.textContent = data.stats.setCount || 0;
          if (unsetEl) unsetEl.textContent = data.stats.unsetCount || 0;
          if (setDescEl) setDescEl.textContent = `${data.stats.agentCount || 5} agent terkonfigurasi`;
          if (pillAll) pillAll.textContent = data.stats.total || 0;
          if (pillSet) pillSet.textContent = data.stats.setCount || 0;
          if (pillUnset) pillUnset.textContent = data.stats.unsetCount || 0;
          if (assignedCount) assignedCount.textContent = `${data.stats.agentCount || 5} Agents`;

          const barEl = document.getElementById('models-metric-bar');
          if (barEl && data.stats.total) {
            const pct = Math.round(((data.stats.setCount || 0) / data.stats.total) * 100);
            barEl.style.width = `${pct}%`;
          }
        }

        renderAssignedAgentsSection(data.agentAssignments || []);
        renderModelsCatalogGrid();
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadModelsView:', err);
      }
    }

    function renderAssignedAgentsSection(assignments) {
      const container = document.getElementById('models-assigned-agents-grid');
      if (!container) return;

      if (!assignments || assignments.length === 0) {
        container.innerHTML = `<div class="col-span-full py-4 text-center text-slate-400 text-xs">Tidak ada agent aktif.</div>`;
        return;
      }

      container.innerHTML = assignments.map(agent => {
        const isRunning = agent.gatewayStatus === 'running';
        const initial = agent.agentName ? agent.agentName.charAt(0).toUpperCase() : 'A';
        return `
          <div class="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl flex flex-col justify-between hover:border-slate-300 transition">
            <div>
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 min-w-0">
                  <div class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                    ${initial}
                  </div>
                  <div class="truncate">
                    <div class="font-bold text-xs text-slate-900 truncate">${escapeHtml(agent.agentName)}</div>
                    <div class="font-mono text-[10px] text-slate-400">${escapeHtml(agent.agentId)}</div>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isRunning ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}">
                  <span class="w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                  ${isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>

              <div class="space-y-2 mt-3 text-xs">
                <div class="bg-white p-2 rounded-lg border border-slate-200/70 shadow-2xs">
                  <div class="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Primary Model</div>
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-mono text-[11px] font-semibold text-indigo-700 truncate" title="${escapeHtml(agent.primaryModel || 'Belum di-set')}">
                      ${escapeHtml(agent.primaryModel || 'Belum di-set')}
                    </span>
                    <button onclick="openAssignModalForAgent('${agent.agentId}', 'primary')" class="text-[10px] text-blue-600 hover:text-blue-800 font-semibold shrink-0 ml-1 cursor-pointer">
                      Ubah
                    </button>
                  </div>
                </div>

                <div class="bg-white p-2 rounded-lg border border-slate-200/70 shadow-2xs">
                  <div class="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Fallback Model</div>
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-mono text-[11px] font-semibold ${agent.fallbackModel ? 'text-amber-700' : 'text-slate-400'} truncate" title="${escapeHtml(agent.fallbackModel || 'Tidak ada fallback')}">
                      ${escapeHtml(agent.fallbackModel || 'Tidak ada fallback')}
                    </span>
                    <button onclick="openAssignModalForAgent('${agent.agentId}', 'fallback')" class="text-[10px] text-blue-600 hover:text-blue-800 font-semibold shrink-0 ml-1 cursor-pointer">
                      Ubah
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function setModelsFilter(filter, el) {
      currentModelsFilter = filter;
      document.querySelectorAll('.models-pill-btn').forEach(btn => {
        btn.classList.remove('bg-slate-900', 'text-white', 'active', 'shadow-xs');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      });
      if (el) {
        el.classList.remove('bg-slate-100', 'text-slate-700');
        el.classList.add('bg-slate-900', 'text-white', 'active', 'shadow-xs');
      }
      renderModelsCatalogGrid();
      lucide.createIcons();
    }

    function filterModelsCatalog() {
      modelsSearchQuery = document.getElementById('models-search-input')?.value.toLowerCase().trim() || '';
      renderModelsCatalogGrid();
      lucide.createIcons();
    }

    function renderModelsCatalogGrid() {
      const container = document.getElementById('models-catalog-grid');
      const emptyEl = document.getElementById('models-catalog-empty');
      if (!container || !globalModelsOverview) return;

      const list = globalModelsOverview.models || [];
      const filtered = list.filter(m => {
        if (currentModelsFilter === 'set' && !m.isSet) return false;
        if (currentModelsFilter === 'unset' && m.isSet) return false;
        if (currentModelsFilter === '9router-ag' && (!m.id.startsWith('ag/'))) return false;
        if (currentModelsFilter === '9router-exp' && (!m.id.startsWith('exp/'))) return false;
        if (currentModelsFilter === 'opencode' && m.provider !== 'opencode-free') return false;

        if (modelsSearchQuery) {
          const q = modelsSearchQuery;
          const matchId = m.id.toLowerCase().includes(q);
          const matchName = m.name.toLowerCase().includes(q);
          const matchCat = m.category.toLowerCase().includes(q);
          const matchTags = (m.tags || []).some(t => t.toLowerCase().includes(q));
          const matchAgents = (m.assigned || []).some(a => a.agentName.toLowerCase().includes(q) || a.agentId.toLowerCase().includes(q));
          if (!matchId && !matchName && !matchCat && !matchTags && !matchAgents) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }
      if (emptyEl) emptyEl.classList.add('hidden');

      container.innerHTML = filtered.map(m => {
        const isSet = m.isSet;
        const isExp = m.id.startsWith('exp/');
        const isOpencode = m.provider === 'opencode-free';

        let provBadge = 'bg-blue-50 text-blue-700 border-blue-200';
        if (isExp) provBadge = 'bg-purple-50 text-purple-700 border-purple-200';
        if (isOpencode) provBadge = 'bg-slate-100 text-slate-700 border-slate-200';

        return `
          <div class="p-4 bg-white border ${isSet ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'} rounded-xl shadow-2xs flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <div class="font-bold text-xs text-slate-900 leading-snug">${escapeHtml(m.name)}</div>
                  <div class="flex items-center gap-1.5 mt-1">
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${provBadge}">
                      ${escapeHtml(m.provider)}
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">${escapeHtml(m.family)}</span>
                  </div>
                </div>

                <div>
                  ${isSet ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Di-Set
                    </span>
                  ` : `
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      Belum Di-Set
                    </span>
                  `}
                </div>
              </div>

              <!-- Model ID box -->
              <div class="mt-2.5 p-1.5 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-600">
                <span class="truncate mr-1 select-all" title="${escapeHtml(m.id)}">${escapeHtml(m.id)}</span>
                <button onclick="navigator.clipboard.writeText('${escapeHtml(m.id)}'); alert('Model ID disalin: ${escapeHtml(m.id)}');" class="text-slate-400 hover:text-slate-700 shrink-0 p-0.5 cursor-pointer" title="Copy Model ID">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              </div>

              <!-- Assigned Details -->
              ${isSet ? `
                <div class="mt-2.5 p-2 bg-emerald-50/60 rounded-lg border border-emerald-100 text-[11px]">
                  <div class="text-[10px] uppercase font-bold text-emerald-800 mb-1">Digunakan Oleh:</div>
                  <div class="space-y-1">
                    ${m.assigned.map(a => `
                      <div class="flex items-center justify-between text-emerald-900">
                        <span class="font-medium">• ${escapeHtml(a.agentName)}</span>
                        <span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-100/90 text-emerald-800 font-semibold uppercase">${escapeHtml(a.role)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Specs & Tags -->
              <div class="mt-3 flex flex-wrap items-center gap-1 text-[10px]">
                <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Ctx: ${escapeHtml(m.contextWindow)}</span>
                ${(m.tags || []).map(t => `<span class="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-500">${escapeHtml(t)}</span>`).join('')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-[10px] text-slate-400 truncate mr-2" title="${escapeHtml(m.category)}">${escapeHtml(m.category)}</span>
              <button onclick="openAssignModal('${escapeHtml(m.id)}', '${escapeHtml(m.name)}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition cursor-pointer shrink-0">
                <i data-lucide="user-plus" class="w-3 h-3"></i>
                <span>Assign ke Agent</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function populateAssignModalDropdowns() {
      const modelSelect = document.getElementById('assign-modal-model-select');
      const agentSelect = document.getElementById('assign-modal-agent-select');
      if (!modelSelect || !agentSelect || !globalModelsOverview) return;

      const models = globalModelsOverview.models || [];
      const groups = {
        '9router Antigravity (ag/*)': models.filter(m => m.id.startsWith('ag/')),
        '9router ExpLabs (exp/*)': models.filter(m => m.id.startsWith('exp/')),
        'OpenCode Free (Zen/Go)': models.filter(m => m.provider === 'opencode-free')
      };

      let html = '';
      for (const [groupName, groupModels] of Object.entries(groups)) {
        if (groupModels.length === 0) continue;
        html += `<optgroup label="${escapeHtml(groupName)}">`;
        for (const m of groupModels) {
          const setTag = m.isSet ? ' [Di-Set]' : '';
          html += `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.id)})${setTag}</option>`;
        }
        html += `</optgroup>`;
      }
      modelSelect.innerHTML = html;

      const agents = globalModelsOverview.agentAssignments || [];
      agentSelect.innerHTML = agents.map(a => `
        <option value="${escapeHtml(a.agentId)}">${escapeHtml(a.agentName)} (${escapeHtml(a.agentId)})</option>
      `).join('');
    }

    function openAssignModal(modelId, modelName) {
      populateAssignModalDropdowns();
      const modal = document.getElementById('assign-model-modal');
      const modelSelect = document.getElementById('assign-modal-model-select');
      if (modelSelect && modelId) {
        modelSelect.value = modelId;
      }
      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function openAssignModalForAgent(agentId, role) {
      populateAssignModalDropdowns();
      const modal = document.getElementById('assign-model-modal');
      const agentSelect = document.getElementById('assign-modal-agent-select');
      if (agentSelect && agentId) {
        agentSelect.value = agentId;
      }
      const roleRadio = document.querySelector(`input[name="assign-role"][value="${role}"]`);
      if (roleRadio) roleRadio.checked = true;
      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeAssignModelModal() {
      const modal = document.getElementById('assign-model-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function submitModelAssignment() {
      const submitBtn = document.getElementById('assign-modal-submit-btn');
      const agentId = document.getElementById('assign-modal-agent-select')?.value;
      const model = document.getElementById('assign-modal-model-select')?.value;
      const role = document.querySelector('input[name="assign-role"]:checked')?.value || 'primary';

      if (!agentId || !model) {
        alert('Agent dan Model harus dipilih.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const { ok: assignOk, data } = await apiFull('/api/models/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, model, role })
        });
        if (!assignOk || !data.success) {
          throw new Error(data.error || 'Gagal menyimpan konfigurasi model');
        }
        alert(`Model berhasil dialokasikan ke agent ${agentId} sebagai ${role}!`);
        closeAssignModelModal();
        await loadModelsView();
        await fetchLiveMetrics();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function switchToAgentEdit(agentId) {
      const modelsView = document.getElementById('view-models');
      if (modelsView) modelsView.classList.add('hidden');
      openEditAgent(agentId);
    }

    // ================= CHANNELS VIEW LOGIC =================
    let globalChannelsOverview = null;
    let currentChannelsFilter = 'all';
    let channelsSearchQuery = '';
    let activeConfiguringChannel = null;

    async function loadChannelsView() {
      try {
        const data = await api('/api/channels/overview', {}, 'Gagal memuat daftar channels');
        globalChannelsOverview = data;

        if (data.stats) {
          const totalEl = document.getElementById('channels-metric-total');
          const confEl = document.getElementById('channels-metric-configured');
          const unconfEl = document.getElementById('channels-metric-unconfigured');
          const pillAll = document.getElementById('ch-pill-count-all');
          const pillSet = document.getElementById('ch-pill-count-set');
          const pillUnset = document.getElementById('ch-pill-count-unset');

          if (totalEl) totalEl.textContent = data.stats.total || 10;
          if (confEl) confEl.textContent = data.stats.configuredCount || 1;
          if (unconfEl) unconfEl.textContent = data.stats.unconfiguredCount || 9;
          if (pillAll) pillAll.textContent = data.stats.total || 10;
          if (pillSet) pillSet.textContent = data.stats.configuredCount || 1;
          if (pillUnset) pillUnset.textContent = data.stats.unconfiguredCount || 9;

          const barEl = document.getElementById('channels-metric-bar');
          if (barEl && data.stats.total) {
            const pct = Math.round(((data.stats.configuredCount || 0) / data.stats.total) * 100);
            barEl.style.width = `${pct}%`;
          }
        }

        renderTelegramChannelCard(data);
        renderChannelsCatalogGrid();
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadChannelsView:', err);
      }
    }

    function renderTelegramChannelCard(data) {
      const tg = (data.channels || []).find(c => c.id === 'telegram');
      if (!tg) return;

      const chatIdEl = document.getElementById('tg-card-chat-id');
      if (chatIdEl) chatIdEl.textContent = tg.chatId || '—';

      const sTopicEl = document.getElementById('tg-topic-server');
      const aTopicEl = document.getElementById('tg-topic-agent');
      const alTopicEl = document.getElementById('tg-topic-alerts');

      if (sTopicEl) sTopicEl.textContent = `Topic #${tg.topics?.server_status || '2'}`;
      if (aTopicEl) aTopicEl.textContent = `Topic #${tg.topics?.agent_execution || '4'}`;
      if (alTopicEl) alTopicEl.textContent = `Topic #${tg.topics?.system_alerts || '6'}`;

      const agentsGrid = document.getElementById('tg-card-agents-grid');
      if (agentsGrid && tg.agentBots) {
        agentsGrid.innerHTML = tg.agentBots.map(a => {
          const isRunning = a.gatewayStatus === 'running';
          const initial = a.agentName ? a.agentName.charAt(0).toUpperCase() : 'A';
          return `
            <div class="p-2.5 bg-slate-50/80 border border-slate-200/80 rounded-lg flex items-center justify-between hover:border-slate-300 transition">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 rounded bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                  ${initial}
                </div>
                <div class="truncate">
                  <div class="font-bold text-xs text-slate-900 truncate">${escapeHtml(a.agentName)}</div>
                  <div class="font-mono text-[10px] text-slate-400">Token: ${escapeHtml(a.botTokenMasked || 'Not set')}</div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${isRunning ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}">
                  <span class="w-1 h-1 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                  ${isRunning ? 'Running' : 'Stopped'}
                </span>
                <div class="text-[10px] text-slate-400 font-mono mt-0.5">${a.topicId ? (a.topicId.startsWith('(') ? a.topicId : `Topic #${a.topicId}`) : 'Main'}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    function setChannelsFilter(filter, el) {
      currentChannelsFilter = filter;
      document.querySelectorAll('.channels-pill-btn').forEach(btn => {
        btn.classList.remove('bg-slate-900', 'text-white', 'active', 'shadow-xs');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      });
      if (el) {
        el.classList.remove('bg-slate-100', 'text-slate-700');
        el.classList.add('bg-slate-900', 'text-white', 'active', 'shadow-xs');
      }
      renderChannelsCatalogGrid();
      lucide.createIcons();
    }

    function filterChannelsCatalog() {
      channelsSearchQuery = document.getElementById('channels-search-input')?.value.toLowerCase().trim() || '';
      renderChannelsCatalogGrid();
      lucide.createIcons();
    }

    function renderChannelsCatalogGrid() {
      const container = document.getElementById('channels-catalog-grid');
      const emptyEl = document.getElementById('channels-catalog-empty');
      if (!container || !globalChannelsOverview) return;

      const list = globalChannelsOverview.channels || [];
      const filtered = list.filter(ch => {
        if (currentChannelsFilter === 'configured' && !ch.isConfigured) return false;
        if (currentChannelsFilter === 'unconfigured' && ch.isConfigured) return false;
        if (currentChannelsFilter === 'chat' && !['telegram', 'discord', 'slack', 'whatsapp', 'signal', 'teams', 'google_chat'].includes(ch.id)) return false;
        if (currentChannelsFilter === 'social-api' && !['twitter', 'email', 'webhook'].includes(ch.id)) return false;

        if (channelsSearchQuery) {
          const q = channelsSearchQuery;
          const matchId = ch.id.toLowerCase().includes(q);
          const matchName = ch.name.toLowerCase().includes(q);
          const matchCat = (ch.category || '').toLowerCase().includes(q);
          const matchDesc = (ch.description || '').toLowerCase().includes(q);
          if (!matchId && !matchName && !matchCat && !matchDesc) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }
      if (emptyEl) emptyEl.classList.add('hidden');

      container.innerHTML = filtered.map(ch => {
        const isConf = ch.isConfigured;
        const iconName = ch.icon || 'radio';

        let categoryBadge = 'bg-slate-100 text-slate-600 border-slate-200';
        if (ch.category && ch.category.includes('Primary')) categoryBadge = 'bg-blue-50 text-blue-700 border-blue-200';
        else if (ch.category && ch.category.includes('Community')) categoryBadge = 'bg-purple-50 text-purple-700 border-purple-200';
        else if (ch.category && ch.category.includes('Workplace')) categoryBadge = 'bg-amber-50 text-amber-700 border-amber-200';
        else if (ch.category && ch.category.includes('Enterprise')) categoryBadge = 'bg-indigo-50 text-indigo-700 border-indigo-200';

        return `
          <div class="p-4 bg-white border ${isConf ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'} rounded-xl shadow-2xs flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-8 h-8 rounded-lg ${isConf ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'} flex items-center justify-center shrink-0">
                    <i data-lucide="${iconName}" class="w-4 h-4"></i>
                  </div>
                  <div class="truncate">
                    <div class="font-bold text-xs text-slate-900 truncate">${escapeHtml(ch.name)}</div>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border ${categoryBadge}">
                        ${escapeHtml(ch.category || 'Messaging')}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  ${isConf ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Terkonfigurasi
                    </span>
                  ` : `
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      Belum Diset
                    </span>
                  `}
                </div>
              </div>

              <p class="text-xs text-slate-500 mt-2 leading-relaxed">
                ${escapeHtml(ch.description || '')}
              </p>

              <!-- Keys Status or Details -->
              <div class="mt-3 p-2.5 bg-slate-50/90 rounded-lg border border-slate-100 text-[11px] space-y-1.5">
                ${isConf ? `
                  <div class="flex items-center justify-between text-slate-600">
                    <span class="text-slate-400">Agent Bots:</span>
                    <span class="font-mono font-bold text-emerald-700">${ch.agentBots ? ch.agentBots.length : 5} Active</span>
                  </div>
                  <div class="flex items-center justify-between text-slate-600">
                    <span class="text-slate-400">Target Chat:</span>
                    <span class="font-mono text-slate-800 font-semibold">${escapeHtml(ch.chatId || '—')}</span>
                  </div>
                ` : `
                  <div class="text-[10px] font-bold text-slate-400 uppercase">Parameter Kredensial:</div>
                  <div class="flex flex-wrap gap-1">
                    ${(ch.keys || []).map(k => `
                      <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">${escapeHtml(k.name)}</span>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-[10px] text-slate-400 font-mono">${ch.plugin || 'builtin'}</span>
              ${isConf ? `
                <button onclick="openTelegramSettingsModal()" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition cursor-pointer">
                  <i data-lucide="sliders" class="w-3 h-3"></i>
                  <span>Kelola</span>
                </button>
              ` : `
                <button onclick="openConfigureChannelModal('${escapeHtml(ch.id)}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer shadow-2xs">
                  <i data-lucide="plus" class="w-3 h-3"></i>
                  <span>Konfigurasi</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    }

    function openConfigureChannelModal(channelId) {
      if (!globalChannelsOverview) return;
      const ch = (globalChannelsOverview.channels || []).find(c => c.id === channelId);
      if (!ch) return;

      activeConfiguringChannel = ch;
      const modal = document.getElementById('configure-channel-modal');
      const titleEl = document.getElementById('ch-modal-title');
      const subEl = document.getElementById('ch-modal-subtitle');
      const descEl = document.getElementById('ch-modal-description');
      const iconEl = document.getElementById('ch-modal-icon');
      const inputsContainer = document.getElementById('ch-modal-inputs-container');

      if (titleEl) titleEl.textContent = `Konfigurasi ${ch.name}`;
      if (subEl) subEl.textContent = `${ch.id} · ${ch.plugin || 'plugin'}`;
      if (descEl) descEl.textContent = ch.description || 'Masukkan kredensial integrasi untuk mengaktifkan channel ini.';
      if (iconEl) iconEl.setAttribute('data-lucide', ch.icon || 'radio');

      if (inputsContainer && ch.keys) {
        inputsContainer.innerHTML = ch.keys.map(k => `
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${escapeHtml(k.label)}</label>
            <input
              type="${k.type || 'text'}"
              name="ch_key_${escapeHtml(k.name)}"
              id="input_ch_${escapeHtml(k.name)}"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              placeholder="Masukkan ${escapeHtml(k.label)}"
            />
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(k.name)}</div>
          </div>
        `).join('');
      }

      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeConfigureChannelModal() {
      const modal = document.getElementById('configure-channel-modal');
      if (modal) modal.classList.add('hidden');
      activeConfiguringChannel = null;
    }

    async function submitChannelConfiguration() {
      if (!activeConfiguringChannel) return;
      const submitBtn = document.getElementById('ch-modal-submit-btn');
      const keys = {};

      (activeConfiguringChannel.keys || []).forEach(k => {
        const input = document.getElementById(`input_ch_${k.name}`);
        if (input && input.value.trim()) {
          keys[k.name] = input.value.trim();
        }
      });

      if (Object.keys(keys).length === 0) {
        alert('Harap isi minimal satu parameter kredensial.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const { ok: chCfgOk, data } = await apiFull('/api/channels/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: activeConfiguringChannel.id, keys })
        });
        if (!chCfgOk || !data.success) {
          throw new Error(data.error || 'Gagal menyimpan konfigurasi channel');
        }
        alert(`Konfigurasi untuk ${activeConfiguringChannel.name} berhasil disimpan!`);
        closeConfigureChannelModal();
        await loadChannelsView();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function openTelegramSettingsModal() {
      if (!globalChannelsOverview) return;
      const tg = (globalChannelsOverview.channels || []).find(c => c.id === 'telegram');
      const modal = document.getElementById('telegram-settings-modal');

      if (tg) {
        const chatIdInput = document.getElementById('tg-settings-chat-id');
        const sTopicInput = document.getElementById('tg-settings-topic-server');
        const aTopicInput = document.getElementById('tg-settings-topic-agent');
        const alTopicInput = document.getElementById('tg-settings-topic-alerts');
        const enabledCheckbox = document.getElementById('tg-settings-enabled');

        if (chatIdInput) chatIdInput.value = tg.chatId || '';
        if (sTopicInput) sTopicInput.value = tg.topics?.server_status || '2';
        if (aTopicInput) aTopicInput.value = tg.topics?.agent_execution || '4';
        if (alTopicInput) alTopicInput.value = tg.topics?.system_alerts || '6';
        if (enabledCheckbox) enabledCheckbox.checked = tg.status === 'active';

        const auto = tg.autoNotify || {};
        const chkStart = document.getElementById('tg-notify-task-start');
        const chkComp = document.getElementById('tg-notify-task-complete');
        const chkBlk = document.getElementById('tg-notify-task-block');
        const chkAlert = document.getElementById('tg-notify-server-alert');

        if (chkStart) chkStart.checked = auto.onTaskStart !== false;
        if (chkComp) chkComp.checked = auto.onTaskComplete !== false;
        if (chkBlk) chkBlk.checked = auto.onTaskBlock !== false;
        if (chkAlert) chkAlert.checked = auto.onServerAlert !== false;
      }

      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeTelegramSettingsModal() {
      const modal = document.getElementById('telegram-settings-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function saveTelegramSettings() {
      const submitBtn = document.getElementById('tg-settings-submit-btn');
      const enabled = document.getElementById('tg-settings-enabled')?.checked;
      const chatId = document.getElementById('tg-settings-chat-id')?.value.trim();
      const botToken = document.getElementById('tg-settings-bot-token')?.value.trim();
      const serverTopic = document.getElementById('tg-settings-topic-server')?.value.trim();
      const agentTopic = document.getElementById('tg-settings-topic-agent')?.value.trim();
      const alertsTopic = document.getElementById('tg-settings-topic-alerts')?.value.trim();

      const autoNotify = {
        onTaskStart: document.getElementById('tg-notify-task-start')?.checked,
        onTaskComplete: document.getElementById('tg-notify-task-complete')?.checked,
        onTaskBlock: document.getElementById('tg-notify-task-block')?.checked,
        onServerAlert: document.getElementById('tg-notify-server-alert')?.checked
      };

      const payload = {
        enabled,
        chatId,
        topics: {
          server_status: serverTopic,
          agent_execution: agentTopic,
          system_alerts: alertsTopic
        },
        autoNotify
      };
      if (botToken) payload.botToken = botToken;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const { ok: tgSaveOk, data } = await apiFull('/api/channels/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!tgSaveOk || !data.success) {
          throw new Error(data.error || 'Gagal menyimpan pengaturan Telegram');
        }
        alert('Pengaturan Telegram berhasil disimpan!');
        closeTelegramSettingsModal();
        await loadChannelsView();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async function sendQuickTelegramTest() {
      try {
        const { ok: tgTestOk, data } = await apiFull('/api/channels/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '🛰️ [Mission Control] Test ping dari Telegram Channels Manager.' })
        });
        if (!tgTestOk || !data.success) {
          throw new Error(data.error || 'Gagal mengirim pesan test');
        }
        alert('Pesan uji coba berhasil dikirim ke Telegram!');
      } catch (err) {
        alert('Error pengiriman: ' + err.message);
      }
    }

    async function sendQuickTelegramStatus() {
      try {
        const { ok: tgStatusOk, data } = await apiFull('/api/channels/telegram/send-status', {
          method: 'POST'
        });
        if (!tgStatusOk || !data.success) {
          throw new Error(data.error || 'Gagal mengirim laporan status');
        }
        alert('Laporan telemetri server berhasil dikirim ke Topic #2 Telegram!');
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    // ================= SKILLS VIEW LOGIC =================
    let globalSkillsData = null;
    let currentSkillsFilter = 'all';
    let skillsSearchQuery = '';

    async function loadSkillsView() {
      try {
        const data = await api('/api/skills', {}, 'Gagal memuat katalog skills');
        globalSkillsData = data;

        if (data.stats) {
          const totEl = document.getElementById('skills-metric-total');
          const bEl = document.getElementById('skills-metric-builtin');
          const lEl = document.getElementById('skills-metric-local');
          const cEl = document.getElementById('skills-metric-categories');
          const pAll = document.getElementById('sk-pill-count-all');
          const pB = document.getElementById('sk-pill-count-builtin');
          const pL = document.getElementById('sk-pill-count-local');

          if (totEl) totEl.textContent = data.stats.total || 0;
          if (bEl) bEl.textContent = data.stats.builtinCount || 0;
          if (lEl) lEl.textContent = data.stats.localCount || 0;
          if (cEl) cEl.textContent = data.stats.categoriesCount || 0;
          if (pAll) pAll.textContent = data.stats.total || 0;
          if (pB) pB.textContent = data.stats.builtinCount || 0;
          if (pL) pL.textContent = data.stats.localCount || 0;

          const barEl = document.getElementById('skills-metric-bar');
          if (barEl && data.stats.total) {
            const pct = Math.round(((data.stats.builtinCount || 0) / data.stats.total) * 100);
            barEl.style.width = `${pct}%`;
          }
          const localBarEl = document.getElementById('skills-metric-local-bar');
          if (localBarEl && data.stats.total) {
            const pct = Math.round(((data.stats.localCount || 0) / data.stats.total) * 100);
            localBarEl.style.width = `${pct}%`;
          }
        }

        renderSkillsCatalogGrid();
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadSkillsView:', err);
      }
    }

    function setSkillsFilter(filter, el) {
      currentSkillsFilter = filter;
      document.querySelectorAll('.skills-pill-btn').forEach(btn => {
        btn.classList.remove('bg-slate-900', 'text-white', 'active', 'shadow-xs');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      });
      if (el) {
        el.classList.remove('bg-slate-100', 'text-slate-700');
        el.classList.add('bg-slate-900', 'text-white', 'active', 'shadow-xs');
      }
      renderSkillsCatalogGrid();
      lucide.createIcons();
    }

    function filterSkillsCatalog() {
      skillsSearchQuery = document.getElementById('skills-search-input')?.value.toLowerCase().trim() || '';
      renderSkillsCatalogGrid();
      lucide.createIcons();
    }

    function renderSkillsCatalogGrid() {
      const container = document.getElementById('skills-catalog-grid');
      const emptyEl = document.getElementById('skills-catalog-empty');
      if (!container || !globalSkillsData) return;

      const list = globalSkillsData.skills || [];
      const filtered = list.filter(s => {
        if (currentSkillsFilter === 'builtin' && !s.isBuiltin) return false;
        if (currentSkillsFilter === 'local' && s.isBuiltin) return false;
        if (currentSkillsFilter !== 'all' && currentSkillsFilter !== 'builtin' && currentSkillsFilter !== 'local') {
          if ((s.category || '').toLowerCase() !== currentSkillsFilter.toLowerCase()) return false;
        }

        if (skillsSearchQuery) {
          const q = skillsSearchQuery;
          const matchName = (s.name || '').toLowerCase().includes(q);
          const matchCat = (s.category || '').toLowerCase().includes(q);
          const matchDesc = (s.description || '').toLowerCase().includes(q);
          const matchTags = (s.tags || []).some(t => t.toLowerCase().includes(q));
          if (!matchName && !matchCat && !matchDesc && !matchTags) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }
      if (emptyEl) emptyEl.classList.add('hidden');

      container.innerHTML = filtered.map(s => {
        const isBuiltin = s.isBuiltin;
        const tags = s.tags || [];

        let catBadgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (s.category === 'autonomous-ai-agents') catBadgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
        else if (s.category === 'software-development') catBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        else if (s.category === 'creative') catBadgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
        else if (s.category === 'productivity') catBadgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        else if (s.category === 'research') catBadgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
        else if (s.category === 'apple') catBadgeColor = 'bg-rose-50 text-rose-700 border-rose-200';

        return `
          <div class="p-4 bg-white border border-slate-200/90 rounded-xl shadow-2xs flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <div class="font-bold font-mono text-xs text-slate-900 truncate" title="${escapeHtml(s.name)}">
                    ${escapeHtml(s.name)}
                  </div>
                  <div class="flex items-center gap-1.5 mt-1">
                    <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border ${catBadgeColor}">
                      ${escapeHtml(s.category || 'General')}
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono">v${escapeHtml(s.version || '1.0')}</span>
                  </div>
                </div>

                <div>
                  ${isBuiltin ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      Bawaan
                    </span>
                  ` : `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Custom
                    </span>
                  `}
                </div>
              </div>

              <!-- Description -->
              <p class="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed" title="${escapeHtml(s.description || '')}">
                ${escapeHtml(s.description || 'Tidak ada deskripsi.')}
              </p>

              <!-- Tags list -->
              ${tags.length > 0 ? `
                <div class="mt-3 flex flex-wrap items-center gap-1 text-[10px]">
                  ${tags.slice(0, 4).map(t => `<span class="px-1.5 py-0.5 bg-slate-50 border border-slate-200/80 rounded text-slate-500 font-mono">${escapeHtml(t)}</span>`).join('')}
                  ${tags.length > 4 ? `<span class="text-slate-400 text-[10px]">+${tags.length - 4}</span>` : ''}
                </div>
              ` : ''}
            </div>

            <!-- Footer actions -->
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button onclick="viewSkillDetail('${escapeHtml(s.skillFile)}', '${escapeHtml(s.name)}')" class="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer">
                <i data-lucide="file-text" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>SKILL.md</span>
              </button>

              <button onclick="confirmDeleteSkill('${escapeHtml(s.name)}', '${escapeHtml(s.category)}', '${escapeHtml(s.path)}')" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-xs font-medium transition cursor-pointer" title="Hapus Skill">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Hapus</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function viewSkillDetail(skillFilePath, skillName) {
      try {
        const data = await api(`/api/skills/detail?path=${encodeURIComponent(skillFilePath)}`, {}, 'Gagal membaca isi SKILL.md');

        const modal = document.getElementById('view-skill-modal');
        const titleEl = document.getElementById('skill-detail-title');
        const pathEl = document.getElementById('skill-detail-path');
        const bodyEl = document.getElementById('skill-detail-body');

        if (titleEl) titleEl.textContent = skillName;
        if (pathEl) pathEl.textContent = skillFilePath;
        if (bodyEl) bodyEl.textContent = data.content || '(SKILL.md kosong)';

        if (modal) modal.classList.remove('hidden');
        lucide.createIcons();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function closeViewSkillModal() {
      const modal = document.getElementById('view-skill-modal');
      if (modal) modal.classList.add('hidden');
    }

    function copySkillDetailContent() {
      const text = document.getElementById('skill-detail-body')?.textContent;
      if (text) {
        navigator.clipboard.writeText(text);
        alert('Isi SKILL.md berhasil disalin ke clipboard!');
      }
    }

    function openCreateSkillModal() {
      const modal = document.getElementById('create-skill-modal');
      const nameInput = document.getElementById('create-skill-name');
      const descInput = document.getElementById('create-skill-desc');
      const contentInput = document.getElementById('create-skill-content');

      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (contentInput) {
        contentInput.value = `# Nama Prosedur\\n\\n## Perintah & Instruksi\\n- Gunakan perintah ...\\n- Hindari ...\\n`;
      }

      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeCreateSkillModal() {
      const modal = document.getElementById('create-skill-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function submitCreateSkill() {
      const name = document.getElementById('create-skill-name')?.value.trim();
      const category = document.getElementById('create-skill-category')?.value.trim();
      const description = document.getElementById('create-skill-desc')?.value.trim();
      const content = document.getElementById('create-skill-content')?.value.trim();
      const submitBtn = document.getElementById('create-skill-submit-btn');

      if (!name) {
        alert('Nama skill wajib diisi.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const { ok: skCreateOk, data } = await apiFull('/api/skills/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, category, description, content })
        });
        if (!skCreateOk || !data.success) {
          throw new Error(data.error || 'Gagal membuat skill');
        }
        alert(data.message || 'Skill berhasil dibuat!');
        closeCreateSkillModal();
        await loadSkillsView();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function openInstallSkillModal() {
      const modal = document.getElementById('install-skill-modal');
      const idInput = document.getElementById('install-skill-identifier');
      const catInput = document.getElementById('install-skill-category');
      if (idInput) idInput.value = '';
      if (catInput) catInput.value = '';
      if (modal) modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function closeInstallSkillModal() {
      const modal = document.getElementById('install-skill-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function submitInstallSkill() {
      const identifier = document.getElementById('install-skill-identifier')?.value.trim();
      const category = document.getElementById('install-skill-category')?.value.trim();
      const submitBtn = document.getElementById('install-skill-submit-btn');

      if (!identifier) {
        alert('Skill identifier atau URL wajib diisi.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Menginstall...</span>';
      }
      try {
        const { ok: skInstOk, data } = await apiFull('/api/skills/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, category })
        });
        if (!skInstOk || !data.success) {
          throw new Error(data.error || 'Gagal menginstall skill');
        }
        alert(data.message || 'Skill berhasil diinstall!');
        closeInstallSkillModal();
        await loadSkillsView();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="download" class="w-3.5 h-3.5"></i><span>Install Skill</span>';
          lucide.createIcons();
        }
      }
    }

    async function confirmDeleteSkill(name, category, path) {
      if (!confirm(`Apakah Anda yakin ingin menghapus skill "${name}"?\\nDirektori skill akan dihapus dari server.`)) {
        return;
      }

      try {
        const { ok: skDelOk, data } = await apiFull('/api/skills/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, category, path })
        });
        if (!skDelOk || !data.success) {
          throw new Error(data.error || 'Gagal menghapus skill');
        }
        alert(data.message || `Skill "${name}" berhasil dihapus.`);
        await loadSkillsView();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function restoreOfficialSkillsPrompt() {
      if (!confirm('Pulihkan seluruh skill bawaan (official bundled) Hermes?\\nPerintah ini akan merestore skill resmi Hermes yang hilang atau terhapus.')) {
        return;
      }

      try {
        const { ok: skResOk, data } = await apiFull('/api/skills/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'all' })
        });
        if (!skResOk || !data.success) {
          throw new Error(data.error || 'Gagal memulihkan skill official');
        }
        alert('Skill official Hermes berhasil dipulihkan!');
        await loadSkillsView();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    // Navigation Switcher
    function switchNav(element, sectionName) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      if (element && element.classList.contains('nav-item')) {
        element.classList.add('active');
      }

      // Auto-close sidebar on mobile/tablet
      if (window.innerWidth <= 1024) {
        toggleSidebar(false);
      }

      const pageTitle = document.getElementById('page-title');
      const dashView = document.getElementById('view-dashboard');
      const teamView = document.getElementById('view-team');
      const editAgentView = document.getElementById('view-edit-agent');
      const kanbanView = document.getElementById('view-kanban');
      const newTaskView = document.getElementById('view-new-task');
      const scheduleView = document.getElementById('view-schedule');
      const editScheduleView = document.getElementById('view-edit-schedule');
      const docsView = document.getElementById('view-documents');
      const driveView = document.getElementById('view-drive');
      const modelsView = document.getElementById('view-models');
      const channelsView = document.getElementById('view-channels');
      const skillsView = document.getElementById('view-skills');
      const chatLogsView = document.getElementById('view-chat-logs');
      const officeView = document.getElementById('view-office');
      const obsidianGraphView = document.getElementById('view-obsidian-graph');
      const emptyView = document.getElementById('view-empty');

      dashView.classList.add('hidden');
      teamView.classList.add('hidden');
      if (editAgentView) editAgentView.classList.add('hidden');
      kanbanView.classList.add('hidden');
      newTaskView.classList.add('hidden');
      scheduleView.classList.add('hidden');
      if (editScheduleView) editScheduleView.classList.add('hidden');
      docsView.classList.add('hidden');
      if (driveView) driveView.classList.add('hidden');
      if (modelsView) modelsView.classList.add('hidden');
      if (channelsView) channelsView.classList.add('hidden');
      if (skillsView) skillsView.classList.add('hidden');
      if (chatLogsView) chatLogsView.classList.add('hidden');
      if (officeView) officeView.classList.add('hidden');
      if (obsidianGraphView) obsidianGraphView.classList.add('hidden');
      emptyView.classList.add('hidden');

      if (sectionName === 'Dashboard') {
        pageTitle.textContent = 'Local Hermes';
        dashView.classList.remove('hidden');
      } else if (sectionName === 'Team') {
        pageTitle.textContent = 'Team';
        teamView.classList.remove('hidden');
        renderTeamView();
      } else if (sectionName === 'Kanban') {
        pageTitle.textContent = 'Kanban';
        kanbanView.classList.remove('hidden');
        renderKanbanView();
      } else if (sectionName === 'New task') {
        pageTitle.textContent = 'New task';
        newTaskView.classList.remove('hidden');
        document.getElementById('new-task-title')?.focus();
      } else if (sectionName === 'Schedule') {
        pageTitle.textContent = 'Schedule';
        scheduleView.classList.remove('hidden');
        updateScheduleDateDisplay();
        renderScheduleView();
      } else if (sectionName === 'Documents') {
        pageTitle.textContent = 'Documents';
        docsView.classList.remove('hidden');
        loadDocsView();
      } else if (sectionName === 'Drive') {
        pageTitle.textContent = 'Drive';
        if (driveView) {
          driveView.classList.remove('hidden');
          loadDriveView();
        }
      } else if (sectionName === 'Models') {
        pageTitle.textContent = 'Models';
        if (modelsView) {
          modelsView.classList.remove('hidden');
          loadModelsView();
        }
      } else if (sectionName === 'Channels') {
        pageTitle.textContent = 'Channels';
        if (channelsView) {
          channelsView.classList.remove('hidden');
          loadChannelsView();
        }
      } else if (sectionName === 'Skills') {
        pageTitle.textContent = 'Skills';
        if (skillsView) {
          skillsView.classList.remove('hidden');
          loadSkillsView();
        }
      } else if (sectionName === 'Chat Logs' || sectionName === 'All Chats') {
        pageTitle.textContent = 'Chat Logs';
        if (chatLogsView) {
          chatLogsView.classList.remove('hidden');
          loadChatLogsView();
        }
      } else if (sectionName === 'Office') {
        pageTitle.textContent = 'Office';
        if (officeView) {
          officeView.classList.remove('hidden');
          loadOfficeView();
        }
      } else if (sectionName === 'Obsidian Graph') {
        pageTitle.textContent = 'Obsidian Graph';
        if (obsidianGraphView) {
          obsidianGraphView.classList.remove('hidden');
          loadObsidianGraphView();
        }
      } else {
        pageTitle.textContent = sectionName;
        emptyView.classList.remove('hidden');
        document.getElementById('empty-title').textContent = `No ${sectionName} configured`;
        document.getElementById('empty-desc').textContent = `There are no active records or data entries for ${sectionName} at this time.`;
      }
      lucide.createIcons();
    }

    function switchNavByName(sectionName) {
      const items = Array.from(document.querySelectorAll('.nav-item'));
      const target = items.find(el => el.innerText.trim().toLowerCase() === sectionName.toLowerCase());
      switchNav(target, sectionName);
    }

    function renderDashboardSessions(sessions) {
      const emptyEl = document.getElementById('sessions-empty');
      const listEl = document.getElementById('sessions-activity-list');
      const badgeEl = document.getElementById('sessions-activity-count');
      if (!listEl) return;

      if (!sessions || sessions.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        if (badgeEl) badgeEl.textContent = '[0]';
        return;
      }

      if (emptyEl) emptyEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      if (badgeEl) badgeEl.textContent = `[${sessions.length}]`;

      listEl.innerHTML = sessions.slice(0, 6).map(s => `
        <div class="py-2.5 px-3 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer" onclick="openChatLogSessionFromDashboard('${s.id}', '${s.profile}')">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-2 h-2 rounded-full shrink-0 ${s.isActive ? 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse' : 'bg-slate-300'}"></span>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-slate-900 truncate">${escapeHtml(s.title || 'Untitled Session')}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${s.profile === 'default' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}">${escapeHtml(s.profile)}</span>
                <span class="text-[10px] font-mono text-slate-400 truncate">${escapeHtml(s.model)}</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                <span>${s.messageCount} msgs</span>
                <span>·</span>
                <span>${formatTokens(s.tokens)}</span>
                <span>·</span>
                <span>ID: ${escapeHtml(s.id.substring(0, 20))}</span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[11px] font-medium text-slate-500">${formatTimeAgo(s.lastActivityAt)}</span>
            <div class="mt-0.5">
              ${s.isActive ? '<span class="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Active</span>' : '<span class="text-[10px] text-slate-400">Done</span>'}
            </div>
          </div>
        </div>
      `).join('');
    }

    async function fetchLiveMetrics() {
      // 1. Sessions data (Hermes SQLite)
      try {
        const sData = await api('/api/sessions/overview', {}, 'Gagal memuat ringkasan sesi');
        {
          globalSessionsData = sData;
          if (sData.stats) {
            const activeEl = document.getElementById('metric-sessions');
            const subEl = document.getElementById('metric-sessions-sub');
            if (activeEl) activeEl.textContent = sData.stats.activeSessions || 0;
            if (subEl) subEl.textContent = `${sData.stats.totalSessions || 0} total`;
          }
          renderDashboardSessions(sData.recentSessions || []);
        }
      } catch (e) {
        console.error('Error fetching sessions:', e);
      }

      // 2. Channels data (Hermes Channels)
      try {
        const cData = await api('/api/channels/overview', {}, 'Gagal memuat ringkasan channels');
        {
          if (cData.stats) {
            const chanEl = document.getElementById('metric-channels');
            const chanSub = document.getElementById('metric-channels-sub');
            if (chanEl) chanEl.textContent = cData.stats.configuredCount || 1;
            if (chanSub) chanSub.textContent = `${cData.stats.configuredCount} on · ${cData.stats.unconfiguredCount} available`;

            const cwCount = document.getElementById('channels-count');
            const cwOn = document.getElementById('channels-on');
            if (cwCount) cwCount.textContent = `[${cData.stats.configuredCount}]`;
            if (cwOn) cwOn.textContent = `${cData.stats.configuredCount} on · ${cData.stats.unconfiguredCount} available`;

            const cList = document.getElementById('channels-list');
            if (cList && cData.channels) {
              cList.innerHTML = cData.channels.map(ch => ch.configured ? `
                <span style="background:#ecfdf5;color:#059669;font-weight:600;border-radius:9999px;padding:3px 10px;font-size:11px;border:1px solid #a7f3d0;">● ${escapeHtml(ch.name.split(' ')[0])}</span>
              ` : `
                <span style="background:#f8fafc;color:#94a3b8;font-weight:500;border-radius:9999px;padding:3px 8px;font-size:10.5px;border:1px solid #e2e8f0;">○ ${escapeHtml(ch.name.split(' ')[0])}</span>
              `).join('');
            }
          }
        }
      } catch (e) {
        console.error('Error fetching channels overview:', e);
      }

      // 3. Skills data (Hermes skills catalog)
      try {
        const skData = await api('/api/skills', {}, 'Gagal memuat katalog skills');
        {
          if (skData.stats) {
            const skEl = document.getElementById('metric-skills');
            const skSub = document.getElementById('metric-skills-sub');
            const skBar = document.getElementById('metric-skills-bar');
            if (skEl) skEl.textContent = skData.stats.total || 0;
            if (skSub) skSub.textContent = `${skData.stats.builtinCount} of ${skData.stats.total}`;
            if (skBar && skData.stats.total) {
              const pct = Math.round((skData.stats.builtinCount / skData.stats.total) * 100);
              skBar.style.width = `${pct}%`;
            }
          }
        }
      } catch (e) {
        console.error('Error fetching skills:', e);
      }

      // 4. Models data (Upstream 9router & OpenCode)
      try {
        const mData = await api('/api/models/overview', {}, 'Gagal memuat ringkasan model');
        {
          if (mData.stats) {
            const provEl = document.getElementById('metric-providers');
            const provSub = document.getElementById('metric-providers-sub');
            if (provEl) provEl.textContent = '1';
            if (provSub) provSub.textContent = `current: 9router (${mData.stats.total} models)`;
          }
        }
      } catch (e) {
        console.error('Error fetching models overview:', e);
      }

      // 5. Profiles data
      try {
        const data = await api('/api/profiles', {}, 'Gagal memuat daftar agent');
        {
          const profiles = data.profiles || [];
          globalProfiles = profiles;

          const liveAgents = profiles.map(p => ({
            name: p.id,
            label: p.id === 'default' ? 'Local Hermes' : p.name,
            tag: p.id === 'default' ? 'default' : null,
            online: p.gatewayStatus === 'running'
          }));
          agentsData.length = 0;
          agentsData.push(...liveAgents);
          renderAgents();
          if (!document.getElementById('view-team').classList.contains('hidden')) {
            renderTeamView();
          }
        }
      } catch (e) {
        console.error('Error fetching profiles:', e);
      }

      // Kanban data
      try {
        const d = await api('/api/kanban', {}, 'Gagal memuat data kanban');
        {
          const tasks = d.tasks || [];
          if (tasks.length > 0) {
            liveKanbanTasks = tasks.map(normalizeKanbanTask);
          }
          const done = tasks.filter(t => t.status === 'done').length;
          const total = tasks.length;
          const pct = total ? Math.round((done / total) * 100) : 100;
          
          document.getElementById('metric-tasks').textContent = `${total - done}`;
          document.getElementById('metric-tasks-done').textContent = `${done}/${total} done`;
          document.getElementById('metric-tasks-bar').style.width = `${pct}%`;

          document.getElementById('taskboard-count').textContent = `[${total}]`;
          document.getElementById('taskboard-active').textContent = `${total - done} active`;
          document.getElementById('taskboard-bar').style.width = `${pct}%`;
          document.getElementById('taskboard-done').textContent = `Done ${done}`;
          document.getElementById('taskboard-pct').textContent = `${pct}%`;
          document.getElementById('taskboard-subbar').style.width = `${pct}%`;

          const counts = {};
          tasks.forEach(t => { counts[t.assignee] = (counts[t.assignee] || 0) + 1; });
          document.getElementById('taskboard-tags').innerHTML = Object.entries(counts).map(([k, v]) => `
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;">${k} ${v}</span>
          `).join('');

          if (!document.getElementById('view-kanban').classList.contains('hidden')) {
            renderKanbanView();
          }
        }
      } catch (e) {
        console.error('Error fetching kanban:', e);
      }

      // Schedule data from Hermes Cron API
      try {
        const sd = await api('/api/schedules', {}, 'Gagal memuat jadwal');
        {
          const schedules = sd.schedules || [];
          if (schedules.length > 0) {
            liveScheduleJobs = schedules;
          }
          const enabledCount = schedules.filter(s => s.enabled).length;
          const totalSched = schedules.length;

          document.getElementById('metric-schedules').textContent = `${totalSched}`;
          document.getElementById('metric-schedules-sub').textContent = `${enabledCount} active`;

          document.getElementById('schedule-count').textContent = `[${totalSched}]`;
          document.getElementById('schedule-enabled').textContent = `${enabledCount} enabled`;
          document.getElementById('schedule-ok').textContent = `${enabledCount} ok`;
          document.getElementById('schedule-failed').textContent = `0 failed`;
          document.getElementById('schedule-next').textContent = totalSched > 0 ? schedules[0].name : '—';
          document.getElementById('schedule-nexttime').textContent = totalSched > 0 ? (schedules[0].schedule_display || 'Scheduled') : '—';

          const todayScheds = schedules.slice(0, 3).map(s => `
            <div style="padding:4px 0;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#0f172a;font-weight:500;">${s.name}</span>
              <span style="color:#94a3b8;font-size:11px;font-family:monospace;">${s.schedule_display || s.schedule}</span>
            </div>
          `).join('');
          document.getElementById('schedule-today').innerHTML = todayScheds || '<div style="color:#94a3b8;">No schedules registered</div>';

          if (!document.getElementById('view-schedule').classList.contains('hidden')) {
            renderScheduleView();
          }
        }
      } catch (e) {
        console.error('Error fetching schedules:', e);
      }
    }

