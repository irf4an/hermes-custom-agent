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
        pageTitle.textContent = 'Skills & MCP';
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

