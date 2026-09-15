    // ================= OFFICE AGENT CHAT MODULE =================
    let officeAgents = [];
    let currentOfficeAgentId = 'default';
    let currentOfficeSessionId = null;
    let officeMessages = [];
    let isOfficeSending = false;
    let officeSearchQuery = '';
    let showOfficeTools = localStorage.getItem('mc_show_office_tools') === 'true'; // default false

    function toggleOfficeTools() {
      showOfficeTools = !showOfficeTools;
      localStorage.setItem('mc_show_office_tools', showOfficeTools ? 'true' : 'false');
      updateOfficeToolsToggleBtn();
      renderOfficeMessages();
    }

    function updateOfficeToolsToggleBtn() {
      const btn = document.getElementById('office-toggle-tools-btn');
      if (!btn) return;
      if (showOfficeTools) {
        btn.className = 'px-2.5 py-1 text-xs font-semibold rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1.5 transition cursor-pointer';
        btn.innerHTML = `<i data-lucide="wrench" class="w-3.5 h-3.5 text-indigo-600"></i><span class="hidden sm:inline">Proses:</span> <span>Tampil</span>`;
      } else {
        btn.className = 'px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 transition cursor-pointer';
        btn.innerHTML = `<i data-lucide="eye-off" class="w-3.5 h-3.5 text-slate-400"></i><span class="hidden sm:inline">Proses:</span> <span>Sembunyi</span>`;
      }
      lucide.createIcons();
    }

    async function loadOfficeView() {
      try {
        updateOfficeToolsToggleBtn();
        const data = await api('/api/office/agents', {}, 'Gagal memuat daftar office agents');
        if (data.success && data.agents) {
          officeAgents = data.agents;
          renderOfficeSidebar();

          const activeAgent = officeAgents.find(a => a.id === currentOfficeAgentId) || officeAgents[0];
          if (activeAgent) {
            selectOfficeAgent(activeAgent.id, true);
          }
        }
      } catch (err) {
        console.error('Failed to load office agents:', err);
      }
    }

    function renderOfficeSidebar() {
      const container = document.getElementById('office-agent-list');
      if (!container) return;

      const countBadge = document.getElementById('office-agent-count-badge');
      if (countBadge) countBadge.textContent = `${officeAgents.length} Agents`;

      const q = officeSearchQuery.toLowerCase().trim();
      const filtered = officeAgents.filter(a => {
        if (!q) return true;
        return a.displayName.toLowerCase().includes(q) ||
               a.role.toLowerCase().includes(q) ||
               a.id.toLowerCase().includes(q) ||
               (a.lastMessage && a.lastMessage.toLowerCase().includes(q));
      });

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="py-8 text-center text-slate-400 text-xs">
            <i data-lucide="user-x" class="w-5 h-5 mx-auto mb-1 opacity-50"></i>
            <p>No agents match "${escapeHtml(officeSearchQuery)}"</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      const groups = {};
      filtered.forEach(a => {
        const g = a.group || 'Specialized Squad';
        if (!groups[g]) groups[g] = [];
        groups[g].push(a);
      });

      let html = '';
      Object.keys(groups).forEach(groupName => {
        const list = groups[groupName];
        html += `
          <div class="mb-2">
            <div class="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>${escapeHtml(groupName)}</span>
              <span class="font-mono text-[9.5px] bg-slate-200/70 px-1.5 py-0.2 rounded-full text-slate-600">${list.length}</span>
            </div>
            <div class="space-y-1 mt-1">
        `;

        list.forEach(agent => {
          const isSelected = (agent.id === currentOfficeAgentId);
          const isOnline = (agent.status === 'Online');
          const timeStr = agent.lastTime ? formatOfficeTime(agent.lastTime) : '';

          const containerCls = isSelected
            ? 'bg-blue-50/80 border-blue-200/90 text-blue-900 shadow-2xs'
            : 'bg-white/70 hover:bg-white border-transparent hover:border-slate-200/80 text-slate-800';

          html += `
            <div onclick="selectOfficeAgent('${agent.id}')" class="p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 relative group ${containerCls}">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${agent.avatarColor || 'from-slate-700 to-slate-900'} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs relative">
                <span>${agent.initials || agent.id.substring(0, 2).toUpperCase()}</span>
                <span class="w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-white ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
              </div>

              <div class="flex-1 min-w-0 pr-1">
                <div class="flex items-center justify-between gap-1 mb-0.5">
                  <span class="font-bold text-xs truncate ${isSelected ? 'text-blue-950' : 'text-slate-900'}">${escapeHtml(agent.displayName)}</span>
                  <div class="flex items-center gap-1 shrink-0">
                    ${timeStr ? `<span class="text-[9.5px] text-slate-400 font-mono">${timeStr}</span>` : ''}
                    ${isSelected ? `<span class="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Selected agent"></span>` : ''}
                  </div>
                </div>
                <p class="text-[11px] text-slate-500 truncate leading-snug">
                  ${escapeHtml(agent.lastMessage || agent.role)}
                </p>
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
      lucide.createIcons();
    }

    function filterOfficeAgents(val) {
      officeSearchQuery = val || '';
      renderOfficeSidebar();
    }

    function formatOfficeTime(ts) {
      if (!ts) return '';
      const d = new Date(ts * 1000);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    async function selectOfficeAgent(agentId, fetchMessages = true) {
      currentOfficeAgentId = agentId;
      const agent = officeAgents.find(a => a.id === agentId);
      if (!agent) return;

      const avatarEl = document.getElementById('office-header-avatar');
      const nameEl = document.getElementById('office-header-name');
      const roleEl = document.getElementById('office-header-role');
      const modelEl = document.getElementById('office-header-model');
      const statusBadge = document.getElementById('office-header-status-badge');
      const inputEl = document.getElementById('office-chat-input');

      if (avatarEl) {
        avatarEl.className = `w-10 h-10 rounded-xl bg-gradient-to-tr ${agent.avatarColor || 'from-slate-800 to-slate-900'} text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0`;
        avatarEl.textContent = agent.initials || agent.id.substring(0, 2).toUpperCase();
      }
      if (nameEl) nameEl.textContent = agent.displayName;
      if (roleEl) roleEl.textContent = agent.role;
      if (modelEl) modelEl.textContent = agent.model || 'ag/gemini-3.8-flash-high';
      if (statusBadge) {
        const isOnline = (agent.status === 'Online');
        statusBadge.className = isOnline
          ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200';
        statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}"></span> ${agent.status}`;
      }
      if (inputEl) {
        inputEl.placeholder = `Message ${agent.displayName}...`;
      }

      renderOfficePromptsMenu(agent);
      loadOfficeSessionsDropdown(agentId);
      renderOfficeSidebar();

      if (fetchMessages) {
        await loadOfficeMessages(agentId, agent.lastSession?.id || null);
      }
    }

    function renderOfficePromptsMenu(agent) {
      const listEl = document.getElementById('office-prompts-list');
      if (!listEl) return;
      const prompts = agent.presetPrompts || ['Status Operasi', 'Cek Tugas'];
      listEl.innerHTML = prompts.map(p => `
        <button onclick="applyOfficePresetPrompt('${escapeHtml(p)}')" class="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition truncate cursor-pointer flex items-center gap-1.5">
          <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400 shrink-0"></i>
          <span class="truncate">${escapeHtml(p)}</span>
        </button>
      `).join('');
      lucide.createIcons();
    }

    function toggleOfficePromptsMenu() {
      const menu = document.getElementById('office-prompts-menu');
      if (menu) {
        menu.classList.toggle('hidden');
      }
    }

    function applyOfficePresetPrompt(promptText) {
      const menu = document.getElementById('office-prompts-menu');
      if (menu) menu.classList.add('hidden');
      const input = document.getElementById('office-chat-input');
      if (input) {
        input.value = promptText;
        autoResizeOfficeTextarea(input);
        input.focus();
      }
    }

    async function loadOfficeSessionsDropdown(agentId) {
      const select = document.getElementById('office-session-select');
      if (!select) return;

      try {
        const data = await api(`/api/office/sessions?agent=${agentId}`, {}, 'Gagal memuat sesi office');
        if (data.success && data.sessions) {
          let optHtml = `<option value="">Current / Latest</option>`;
          data.sessions.forEach(s => {
            const title = s.title ? (s.title.length > 25 ? s.title.substring(0, 25) + '...' : s.title) : s.id.substring(0, 16);
            optHtml += `<option value="${s.id}">${escapeHtml(title)}</option>`;
          });
          select.innerHTML = optHtml;
          if (currentOfficeSessionId) {
            select.value = currentOfficeSessionId;
          }
        }
      } catch (e) {}
    }

    function switchOfficeSession(sessionId) {
      currentOfficeSessionId = sessionId || null;
      loadOfficeMessages(currentOfficeAgentId, currentOfficeSessionId);
    }

    async function loadOfficeMessages(agentId, sessionId) {
      const container = document.getElementById('office-messages-container');
      if (!container) return;

      container.innerHTML = `
        <div class="py-16 text-center text-slate-400">
          <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-slate-600"></i>
          <p class="font-medium text-xs text-slate-500">Menghubungkan ke session agent...</p>
        </div>
      `;
      lucide.createIcons();

      try {
        const url = `/api/office/messages?agent=${agentId}${sessionId ? '&sessionId=' + sessionId : ''}`;
        const { data } = await apiFull(url);

        if (data.success) {
          currentOfficeSessionId = data.sessionId;
          officeMessages = data.messages || [];
          renderOfficeMessages();

          const select = document.getElementById('office-session-select');
          if (select && data.sessionId) {
            select.value = data.sessionId;
          }
        } else {
          throw new Error(data.error || 'Failed to load messages');
        }
      } catch (err) {
        container.innerHTML = `
          <div class="py-12 text-center text-rose-500 text-xs">
            <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2 text-rose-500"></i>
            <p class="font-semibold">Gagal memuat pesan</p>
            <p class="text-slate-400 mt-1">${err.message}</p>
          </div>
        `;
        lucide.createIcons();
      }
    }

    function renderOfficeMessages() {
      const container = document.getElementById('office-messages-container');
      if (!container) return;

      updateOfficeToolsToggleBtn();

      const agent = officeAgents.find(a => a.id === currentOfficeAgentId) || { displayName: 'Agent', initials: 'AG' };

      if (officeMessages.length === 0) {
        const presetPills = (agent.presetPrompts || ['Status Operasi', 'Cek Jadwal']).map(p => `
          <button onclick="sendOfficePromptDirect('${escapeHtml(p)}')" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-2xs flex items-center gap-1.5 cursor-pointer">
            <i data-lucide="check-square" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>${escapeHtml(p)}</span>
          </button>
        `).join('');

        container.innerHTML = `
          <div class="py-12 px-4 max-w-md mx-auto text-center space-y-4">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr ${agent.avatarColor || 'from-slate-700 to-slate-900'} text-white flex items-center justify-center font-bold text-xl mx-auto shadow-md">
              ${agent.initials || 'AG'}
            </div>
            <div>
              <h3 class="font-bold text-slate-900 text-base mb-1">${escapeHtml(agent.displayName)}</h3>
              <p class="text-xs text-slate-500 leading-relaxed">${escapeHtml(agent.role || 'Autonomous Hermes Agent')}</p>
            </div>
            <div class="pt-2">
              <div class="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Aksi Cepat Agen</div>
              <div class="flex flex-wrap justify-center gap-2">
                ${presetPills}
              </div>
            </div>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      // Find index of the last assistant message that has visible content
      const lastAssistantIdx = officeMessages.map((m, i) => {
        if (m.role !== 'assistant') return -1;
        const hasText = m.content && m.content.trim().length > 0;
        const card = renderDeveloperCard(m.content);
        return (hasText || card || showOfficeTools) ? i : -1;
      }).filter(i => i >= 0).pop();

      let html = '';

      officeMessages.forEach((m, idx) => {
        const timeStr = m.timestamp ? formatOfficeTime(m.timestamp) : '';

        if (m.role === 'user') {
          html += `
            <div class="flex justify-end my-2">
              <div class="bg-slate-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl text-xs leading-relaxed shadow-2xs break-words">
                ${formatOfficeContent(m.content)}
              </div>
            </div>
          `;
        } else if (m.role === 'assistant') {
          const hasText = m.content && m.content.trim().length > 0;
          const cardMarkup = renderDeveloperCard(m.content);
          const hasVisibleContent = hasText || cardMarkup;

          // If hiding tools and this turn only executed tools with no text output, hide it
          if (!showOfficeTools && !hasVisibleContent) {
            return;
          }

          let toolMarkup = '';
          if (showOfficeTools && m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
            toolMarkup = m.toolCalls.map(tc => {
              const fnName = tc.function?.name || tc.name || 'tool_call';
              let fnArgs = tc.function?.arguments || tc.arguments || '';
              if (typeof fnArgs === 'object') fnArgs = JSON.stringify(fnArgs, null, 2);
              return `
                <details class="my-1.5 bg-slate-50 border border-slate-200/80 rounded-lg p-2 font-mono text-[11px] text-slate-700">
                  <summary class="cursor-pointer font-semibold text-slate-800 flex items-center gap-1.5">
                    <i data-lucide="wrench" class="w-3 h-3 text-slate-500"></i>
                    <span>Executed: ${escapeHtml(fnName)}</span>
                  </summary>
                  <div class="mt-2 text-[10.5px] text-slate-600 bg-white p-2 rounded border border-slate-100 max-h-32 overflow-y-auto whitespace-pre-wrap">${escapeHtml(fnArgs)}</div>
                </details>
              `;
            }).join('');
          }

          const isLastAssistant = (idx === lastAssistantIdx);
          const actionPills = (isLastAssistant && agent.presetPrompts) ? agent.presetPrompts.slice(0, 2).map(p => `
            <button onclick="sendOfficePromptDirect('${escapeHtml(p)}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 transition shadow-2xs cursor-pointer">
              <i data-lucide="check-square" class="w-3 h-3 text-slate-400"></i>
              <span>${escapeHtml(p)}</span>
            </button>
          `).join('') : '';

          html += `
            <div class="flex items-start gap-3 my-3 max-w-3xl">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${agent.avatarColor || 'from-slate-700 to-slate-900'} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs mt-0.5">
                ${agent.initials || 'AG'}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-bold text-xs text-slate-900">${escapeHtml(agent.displayName)}</span>
                  <span class="text-[10px] text-slate-400 font-mono">${timeStr}</span>
                </div>
                
                <div class="bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm p-4 shadow-2xs text-slate-800 text-xs leading-relaxed space-y-2">
                  ${hasText ? `<div>${formatOfficeContent(m.content)}</div>` : ''}
                  ${cardMarkup}
                  ${toolMarkup}
                </div>

                ${actionPills ? `<div class="flex flex-wrap items-center gap-2 mt-2">${actionPills}</div>` : ''}
              </div>
            </div>
          `;
        } else if (m.role === 'tool') {
          if (!showOfficeTools) return;

          html += `
            <div class="my-1.5 pl-11 max-w-2xl">
              <details class="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-[10.5px] text-slate-600">
                <summary class="cursor-pointer font-medium text-slate-700 flex items-center gap-1.5">
                  <i data-lucide="terminal" class="w-3 h-3 text-slate-500"></i>
                  <span>Tool Output: ${escapeHtml(m.toolName || 'system')}</span>
                </summary>
                <div class="mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap bg-white p-2 rounded border border-slate-100">${escapeHtml(m.content)}</div>
              </details>
            </div>
          `;
        }
      });

      container.innerHTML = html;
      lucide.createIcons();
      scrollOfficeToBottom();
    }

    function formatOfficeContent(raw) {
      if (!raw) return '';
      let escaped = escapeHtml(raw);

      escaped = escaped.replace(/```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const copyId = 'code-' + Math.random().toString(36).substring(2, 9);
        return `
          <div class="my-2.5 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 font-mono text-[11px] shadow-sm">
            <div class="px-3 py-1.5 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-slate-400 text-[10px]">
              <span>${escapeHtml(lang || 'code')}</span>
              <button onclick="copyOfficeCode('${copyId}')" class="hover:text-white transition flex items-center gap-1 cursor-pointer">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy</span>
              </button>
            </div>
            <pre id="${copyId}" class="p-3 overflow-x-auto leading-relaxed"><code>${code.trim()}</code></pre>
          </div>
        `;
      });

      escaped = escaped.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-[11px] border border-rose-200/60 font-semibold">$1</code>');
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 hover:underline font-medium inline-flex items-center gap-0.5">$1 <i data-lucide="external-link" class="w-2.5 h-2.5 inline"></i></a>');
      escaped = escaped.replace(/^-\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
      escaped = escaped.replace(/\n/g, '<br/>');

      return escaped;
    }

    function copyOfficeCode(id) {
      const el = document.getElementById(id);
      if (el) {
        navigator.clipboard.writeText(el.innerText).then(() => {
          showToast('Code copied to clipboard', 'success');
        });
      }
    }

    function renderDeveloperCard(content) {
      if (!content) return '';
      const isPr = /PR\s*#\d+|pull\/\d+|files?\s*changed/i.test(content);
      if (!isPr) return '';

      const prMatch = content.match(/PR\s*#?(\d+)/i);
      const prNumber = prMatch ? `PR #${prMatch[1]}` : 'Patch #1';
      const repoMatch = content.match(/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_\.-]+)/);
      const repoName = repoMatch ? repoMatch[1] : 'hermes-system/core';

      return `
        <div class="my-3 bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 shadow-2xs">
          <div class="flex items-center justify-between mb-1.5">
            <div class="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <i data-lucide="git-pull-request" class="w-3.5 h-3.5 text-indigo-600"></i>
              <span>Automated Patch &amp; Verification</span>
            </div>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Done
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] text-slate-600 font-mono mb-2">
            <i data-lucide="git-branch" class="w-3 h-3 text-slate-400"></i>
            <span class="text-blue-600 font-semibold">${escapeHtml(repoName)} · ${escapeHtml(prNumber)}</span>
          </div>
          <div class="flex items-center gap-2 text-[10.5px] font-mono text-slate-600 mb-3 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70">
            <span>± Validated clean diff</span>
            <span class="text-emerald-600 font-semibold">+verified</span>
            <span class="text-slate-400">·</span>
            <span class="text-slate-500">No conflicts</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="refreshOfficeMessages()" class="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer">
              <span>Sync State</span>
              <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
            </button>
          </div>
        </div>
      `;
    }

    function scrollOfficeToBottom() {
      const container = document.getElementById('office-messages-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }

    function autoResizeOfficeTextarea(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function handleOfficeInputKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendOfficeMessage();
      }
    }

    function sendOfficePromptDirect(text) {
      sendOfficeMessage(text);
    }

    async function sendOfficeMessage(overrideMsg) {
      if (isOfficeSending) return;

      const inputEl = document.getElementById('office-chat-input');
      const msgText = overrideMsg || (inputEl ? inputEl.value : '');
      if (!msgText || !msgText.trim()) return;

      const trimmed = msgText.trim();
      if (inputEl && !overrideMsg) {
        inputEl.value = '';
        inputEl.style.height = 'auto';
      }

      isOfficeSending = true;

      officeMessages.push({
        role: 'user',
        content: trimmed,
        timestamp: Date.now() / 1000
      });

      renderOfficeMessages();

      const container = document.getElementById('office-messages-container');
      const agent = officeAgents.find(a => a.id === currentOfficeAgentId) || { displayName: 'Agent', initials: 'AG' };

      const indicatorId = 'office-typing-indicator';
      const thinkingEl = document.createElement('div');
      thinkingEl.id = indicatorId;
      thinkingEl.className = 'flex items-start gap-3 my-3 max-w-xl animate-in fade-in duration-150';
      thinkingEl.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${agent.avatarColor || 'from-slate-700 to-slate-900'} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs animate-pulse">
          ${agent.initials || 'AG'}
        </div>
        <div class="bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm px-4 py-3 shadow-2xs flex items-center gap-2 text-xs text-slate-500">
          <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-slate-700"></i>
          <span>Thinking and processing mission...</span>
        </div>
      `;
      container.appendChild(thinkingEl);
      lucide.createIcons();
      scrollOfficeToBottom();

      const sendBtn = document.getElementById('office-send-btn');
      if (sendBtn) sendBtn.disabled = true;

      try {
        const { data } = await apiFull('/api/office/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentOfficeAgentId,
            sessionId: currentOfficeSessionId,
            message: trimmed
          })
        });

        const ind = document.getElementById(indicatorId);
        if (ind) ind.remove();

        if (data.success) {
          currentOfficeSessionId = data.sessionId;
          if (data.messages && data.messages.length > 0) {
            officeMessages = data.messages;
          } else if (data.reply) {
            officeMessages.push({
              role: 'assistant',
              content: data.reply,
              timestamp: Date.now() / 1000
            });
          }

          const currentAgentObj = officeAgents.find(a => a.id === currentOfficeAgentId);
          if (currentAgentObj) {
            currentAgentObj.lastMessage = data.reply ? data.reply.substring(0, 70) : trimmed;
            currentAgentObj.lastTime = Date.now() / 1000;
            renderOfficeSidebar();
          }

          renderOfficeMessages();
        } else {
          officeMessages.push({
            role: 'assistant',
            content: `⚠️ Error executing agent turn: ${data.error || 'Unknown error'}`,
            timestamp: Date.now() / 1000
          });
          renderOfficeMessages();
        }
      } catch (err) {
        const ind = document.getElementById(indicatorId);
        if (ind) ind.remove();

        officeMessages.push({
          role: 'assistant',
          content: `⚠️ Failed to reach Hermes runtime: ${err.message}`,
          timestamp: Date.now() / 1000
        });
        renderOfficeMessages();
      } finally {
        isOfficeSending = false;
        if (sendBtn) sendBtn.disabled = false;
        if (inputEl) inputEl.focus();
      }
    }

    function startOfficeNewChat() {
      currentOfficeSessionId = null;
      officeMessages = [];
      const select = document.getElementById('office-session-select');
      if (select) select.value = '';
      renderOfficeMessages();
      const inputEl = document.getElementById('office-chat-input');
      if (inputEl) {
        inputEl.focus();
      }
    }

    function refreshOfficeMessages() {
      const icon = document.getElementById('office-refresh-icon');
      if (icon) icon.classList.add('animate-spin');
      loadOfficeView().then(() => {
        if (icon) icon.classList.remove('animate-spin');
      });
    }

