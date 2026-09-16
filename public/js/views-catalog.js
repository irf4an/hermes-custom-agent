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
                    ${channelIconHtml(ch.id, iconName, 'w-4 h-4')}
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
      const wrap = document.getElementById('ch-modal-icon-wrap');
      if (wrap) {
        const brand = channelBrandSvg(ch.id, 'w-4 h-4');
        wrap.innerHTML = brand || `<i data-lucide="${escapeHtml(ch.icon || 'radio')}" class="w-4 h-4"></i>`;
        if (!brand && window.lucide) lucide.createIcons();
      }

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
        loadMCPSection();
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadSkillsView:', err);
      }
    }

    async function loadMCPSection() {
      const grid = document.getElementById('mcp-grid');
      const emptyEl = document.getElementById('mcp-empty');
      const countEl = document.getElementById('mcp-count');
      if (!grid) return;
      try {
        const data = await api('/api/mcp', {}, 'Gagal memuat MCP servers');
        const servers = data.servers || [];
        if (countEl) countEl.textContent = `[${data.stats ? data.stats.total : servers.length}]`;
        if (servers.length === 0) {
          grid.innerHTML = '';
          if (emptyEl) emptyEl.classList.remove('hidden');
          return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        grid.innerHTML = servers.map(s => `
          <div class="p-4 bg-white border border-slate-200/90 rounded-xl shadow-2xs flex flex-col justify-between hover:border-slate-300 hover:shadow-xs transition">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <div class="font-bold font-mono text-xs text-slate-900 truncate" title="${escapeHtml(s.name)}">
                    ${escapeHtml(s.name)}
                  </div>
                  <div class="flex items-center gap-1.5 mt-1">
                    <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border bg-slate-100 text-slate-700 border-slate-200">
                      ${escapeHtml(s.transport || 'stdio')}
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono">${s.tools === null || s.tools === undefined ? '?' : s.tools} tools</span>
                  </div>
                </div>
                <div>
                  ${s.enabled ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Aktif
                    </span>
                  ` : `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                      <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      Mati
                    </span>
                  `}
                </div>
              </div>
              ${s.command ? `
                <p class="text-[11px] text-slate-500 mt-2 font-mono truncate" title="${escapeHtml(s.command)}">
                  ${escapeHtml(s.command)}
                </p>
              ` : ''}
            </div>
          </div>
        `).join('');
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadMCPSection:', err);
        if (emptyEl) {
          emptyEl.classList.remove('hidden');
          emptyEl.textContent = 'Gagal memuat MCP servers.';
        }
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

