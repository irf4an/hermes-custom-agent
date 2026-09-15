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

